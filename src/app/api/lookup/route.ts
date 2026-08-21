import { lookupDomain, mapWithConcurrency } from "@/lib/registry-lookup";
import type { RegistryRecord } from "@/lib/registry-lookup";

/**
 * Registry facts for a batch of domains.
 *
 * Deliberately dumb: it reports what RDAP and DNS say and nothing more.
 * Deciding which of the registered domains are *yours* happens on the client,
 * against the domains you listed, so this route stays stateless and its
 * answers are the same for everyone — which is what makes caching them safe.
 */

// DNS lookups need the Node runtime.
export const runtime = "nodejs";

/** One request covers a slice of the world; the client walks through the rest. */
const MAX_DOMAINS_PER_REQUEST = 40;
/** Polite to registries, and fast enough that a 40-domain batch lands in a few seconds. */
const CONCURRENCY = 8;

const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function normaliseDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const domain = value.trim().toLowerCase().replace(/\.$/, "");
  return DOMAIN_PATTERN.test(domain) ? domain : null;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const raw = (body as { domains?: unknown })?.domains;
  if (!Array.isArray(raw)) {
    return Response.json(
      { error: "Expected { domains: string[] }." },
      { status: 400 },
    );
  }

  const domains = [...new Set(raw.map(normaliseDomain).filter((d): d is string => d !== null))];

  if (domains.length === 0) {
    return Response.json({ error: "No valid domain names given." }, { status: 400 });
  }
  if (domains.length > MAX_DOMAINS_PER_REQUEST) {
    return Response.json(
      { error: `At most ${MAX_DOMAINS_PER_REQUEST} domains per request.` },
      { status: 400 },
    );
  }

  const records = await mapWithConcurrency(domains, CONCURRENCY, lookupDomain);

  const results: Record<string, RegistryRecord> = {};
  for (const record of records) results[record.domain] = record;

  return Response.json({ results });
}
