import "server-only";
import { Resolver } from "node:dns/promises";

/**
 * Server-side registry lookups.
 *
 * Two sources, in order of authority:
 *
 *   RDAP  the registry's own structured WHOIS successor. Definitive, but only
 *         about 70 of the ~250 ccTLDs publish one — .se, .de, .io, .co and
 *         plenty of other popular ones do not.
 *   DNS   the fallback. Nameservers at the apex prove a domain is registered.
 *         The absence of them is only evidence, not proof: a domain can be
 *         registered and never delegated, and it looks identical to a free one
 *         from the outside. Those results are marked low confidence.
 */

/** What a lookup can establish about a name. */
export type RegistryRecord = {
  domain: string;
  registration: "registered" | "available" | "unknown";
  source: "rdap" | "dns";
  confidence: "high" | "low";
  registrant?: string;
  nameservers?: string[];
  registeredOn?: string;
  expiresOn?: string;
  error?: string;
};

const RDAP_BOOTSTRAP = "https://data.iana.org/rdap/dns.json";
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;
const RESULT_TTL_MS = 6 * 60 * 60 * 1000;
const RDAP_TIMEOUT_MS = 8_000;
const DNS_TIMEOUT_MS = 5_000;
/** Enough for a full world scan plus churn; evicted oldest-first. */
const MAX_CACHED_RESULTS = 5_000;

type Bootstrap = { fetchedAt: number; byTld: Map<string, string> };

let bootstrap: Bootstrap | null = null;
let bootstrapInFlight: Promise<Bootstrap> | null = null;

type BootstrapPayload = { services?: [string[], string[]][] };

async function loadBootstrap(): Promise<Bootstrap> {
  const response = await fetch(RDAP_BOOTSTRAP, {
    signal: AbortSignal.timeout(RDAP_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`RDAP bootstrap: HTTP ${response.status}`);

  const payload = (await response.json()) as BootstrapPayload;
  const byTld = new Map<string, string>();
  for (const [tlds, urls] of payload.services ?? []) {
    // Prefer HTTPS endpoints; several entries list both.
    const url = urls.find((candidate) => candidate.startsWith("https://")) ?? urls[0];
    if (!url) continue;
    for (const tld of tlds) {
      byTld.set(tld.toLowerCase(), url.endsWith("/") ? url : `${url}/`);
    }
  }
  return { fetchedAt: Date.now(), byTld };
}

/**
 * IANA's registry of which server answers for which TLD. Cached for a day and
 * deduplicated, so a 250-domain scan fetches it once.
 */
async function getBootstrap(): Promise<Bootstrap> {
  if (bootstrap && Date.now() - bootstrap.fetchedAt < BOOTSTRAP_TTL_MS) {
    return bootstrap;
  }
  bootstrapInFlight ??= loadBootstrap()
    .then((loaded) => {
      bootstrap = loaded;
      return loaded;
    })
    .catch((error) => {
      // A stale bootstrap beats no bootstrap; only fail if there is nothing.
      if (bootstrap) return bootstrap;
      throw error;
    })
    .finally(() => {
      bootstrapInFlight = null;
    });
  return bootstrapInFlight;
}

/** vCard arrays are positional: ["fn", {}, "text", "Google LLC"]. */
type VCardEntry = [string, Record<string, unknown>, string, unknown];

type RdapEntity = {
  roles?: string[];
  vcardArray?: [string, VCardEntry[]];
};

type RdapDomain = {
  entities?: RdapEntity[];
  nameservers?: { ldhName?: string }[];
  events?: { eventAction?: string; eventDate?: string }[];
};

function vcardValue(entity: RdapEntity, field: string): string | undefined {
  const entries = entity.vcardArray?.[1];
  const match = entries?.find((entry) => entry[0] === field);
  const value = match?.[3];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRegistrant(record: RdapDomain): string | undefined {
  const entities = record.entities ?? [];
  const registrant =
    entities.find((entity) => entity.roles?.includes("registrant")) ??
    entities.find((entity) => entity.roles?.includes("administrative"));
  if (!registrant) return undefined;
  return vcardValue(registrant, "org") ?? vcardValue(registrant, "fn");
}

/**
 * Some registries decorate nameserver names with status text — .fi returns
 * "ns1.example.com [OK]". Keep only what can legally be a hostname.
 */
function readNameservers(record: RdapDomain): string[] | undefined {
  const names = (record.nameservers ?? [])
    .map((ns) => ns.ldhName?.trim().toLowerCase().split(/\s+/)[0] ?? "")
    .filter((name) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(name));
  return names.length ? [...new Set(names)].sort() : undefined;
}

function readEvent(record: RdapDomain, action: string): string | undefined {
  const event = record.events?.find((e) => e.eventAction === action);
  return event?.eventDate;
}

/** The TLD an RDAP server is looked up by — always the final label. */
function tldOf(domain: string): string {
  return domain.slice(domain.lastIndexOf(".") + 1).toLowerCase();
}

async function lookupRdap(domain: string): Promise<RegistryRecord | null> {
  let base: string | undefined;
  try {
    base = (await getBootstrap()).byTld.get(tldOf(domain));
  } catch {
    return null; // fall through to DNS
  }
  if (!base) return null;

  let response: Response;
  try {
    response = await fetch(`${base}domain/${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(RDAP_TIMEOUT_MS),
      headers: { accept: "application/rdap+json, application/json" },
    });
  } catch {
    return null;
  }

  if (response.status === 404) {
    return { domain, registration: "available", source: "rdap", confidence: "high" };
  }
  if (!response.ok) {
    // 429 and 403 are rate limits, not verdicts. DNS can still answer.
    return null;
  }

  let record: RdapDomain;
  try {
    record = (await response.json()) as RdapDomain;
  } catch {
    return null;
  }

  return {
    domain,
    registration: "registered",
    source: "rdap",
    confidence: "high",
    registrant: readRegistrant(record),
    nameservers: readNameservers(record),
    registeredOn: readEvent(record, "registration"),
    expiresOn: readEvent(record, "expiration"),
  };
}

function resolver(): Resolver {
  const instance = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 2 });
  return instance;
}

function errorCode(error: unknown): string {
  return (error as { code?: string })?.code ?? "UNKNOWN";
}

async function lookupDns(domain: string): Promise<RegistryRecord> {
  const dns = resolver();
  try {
    const nameservers = await dns.resolveNs(domain);
    return {
      domain,
      registration: "registered",
      source: "dns",
      // Delegation is proof of registration, even without a registry to ask.
      confidence: "high",
      nameservers: [...new Set(nameservers.map((n) => n.toLowerCase()))].sort(),
    };
  } catch (error) {
    const code = errorCode(error);
    if (code !== "ENOTFOUND" && code !== "ENODATA" && code !== "NXDOMAIN") {
      return {
        domain,
        registration: "unknown",
        source: "dns",
        confidence: "low",
        error: `DNS ${code}`,
      };
    }
  }

  // No NS record. Confirm the name is absent from the zone rather than merely
  // undelegated at this level before calling it free.
  try {
    await dns.resolveSoa(domain);
    return { domain, registration: "registered", source: "dns", confidence: "low" };
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOTFOUND" || code === "NXDOMAIN" || code === "ENODATA") {
      return {
        domain,
        registration: "available",
        source: "dns",
        // A registered-but-never-delegated domain is indistinguishable from a
        // free one over DNS, so this verdict is a strong hint, not a fact.
        confidence: "low",
      };
    }
    return {
      domain,
      registration: "unknown",
      source: "dns",
      confidence: "low",
      error: `DNS ${code}`,
    };
  }
}

const cache = new Map<string, { at: number; record: RegistryRecord }>();

function readCache(domain: string): RegistryRecord | undefined {
  const hit = cache.get(domain);
  if (!hit) return undefined;
  if (Date.now() - hit.at > RESULT_TTL_MS) {
    cache.delete(domain);
    return undefined;
  }
  return hit.record;
}

function writeCache(domain: string, record: RegistryRecord): void {
  if (cache.size >= MAX_CACHED_RESULTS) {
    // Map preserves insertion order, so the first key is the oldest write.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(domain, { at: Date.now(), record });
}

/** In-flight deduplication, so a burst of identical requests costs one lookup. */
const inFlight = new Map<string, Promise<RegistryRecord>>();

export async function lookupDomain(domain: string): Promise<RegistryRecord> {
  const cached = readCache(domain);
  if (cached) return cached;

  const existing = inFlight.get(domain);
  if (existing) return existing;

  const promise = (async () => {
    const record = (await lookupRdap(domain)) ?? (await lookupDns(domain));
    writeCache(domain, record);
    return record;
  })()
    .catch(
      (error): RegistryRecord => ({
        domain,
        registration: "unknown",
        source: "dns",
        confidence: "low",
        error: error instanceof Error ? error.message : "Lookup failed",
      }),
    )
    .finally(() => {
      inFlight.delete(domain);
    });

  inFlight.set(domain, promise);
  return promise;
}

/** Runs `worker` over `items` with at most `limit` in flight at once. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}
