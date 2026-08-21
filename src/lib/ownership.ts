import type { RegistryRecord } from "@/lib/registry-lookup";
import type { Ownership } from "@/lib/domain-status";

/**
 * Guessing which registered domains are already yours.
 *
 * There is no reliable way to do this without authentication, and GDPR means
 * most ccTLD registries redact the registrant entirely. So this compares a
 * candidate against the domains you listed as yours, on two public signals:
 *
 *   registrant  the name or organisation, when the registry publishes one
 *   nameservers the delegation, which is public everywhere
 *
 * Nameserver matching is the workhorse but it has a sharp edge. Cloudflare
 * hands each account its own pair (`alice.ns.cloudflare.com`), so an exact
 * match is meaningful. DigitalOcean hands everyone the same three, so an exact
 * match means nothing. The two cases are told apart by whether any nameserver
 * is account-specific — and when they cannot be, the guess is returned as weak
 * rather than dressed up as certain.
 *
 * Route 53 is the case this cannot catch at all: it assigns a unique set per
 * zone, so two domains in the same AWS account share nothing. Those come back
 * `theirs`, which is why every verdict is overridable by hand.
 */

export type OwnershipGuess = {
  ownership: Ownership;
  /** Shown in the UI so the guess can be judged rather than trusted. */
  reason?: string;
  /** Weak guesses are flagged in the UI and are the ones worth correcting. */
  strength: "listed" | "strong" | "weak" | "none";
};

/**
 * Nameserver hostnames that many unrelated customers share. An exact match on
 * one of these says only "same DNS host", never "same owner".
 */
const SHARED_NS_HOSTS = [
  "digitalocean.com",
  "googledomains.com",
  "google.com",
  "azure-dns.com",
  "azure-dns.net",
  "azure-dns.org",
  "azure-dns.info",
  "registrar-servers.com",
  "dnsimple.com",
  "name.com",
  "namecheaphosting.com",
  "domaincontrol.com",
  "wixdns.net",
  "squarespacedns.com",
  "shopify.com",
  "webflow.com",
  "vercel-dns.com",
  "netlify.com",
  "github.io",
  "hover.com",
  "gandi.net",
  "ovh.net",
  "one.com",
  "loopia.se",
  "louhi.net",
  "hostinger.com",
  "bluehost.com",
  "hostgator.com",
  "siteground.net",
  "worldnic.com",
  "ui-dns.com",
  "ui-dns.de",
  "ui-dns.org",
  "ui-dns.biz",
  "ionos.com",
  "porkbun.com",
  "dreamhost.com",
  "linode.com",
  "he.net",
  "dns.he.net",
  "zoneedit.com",
  "no-ip.com",
  "dyndns.org",
];

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** The last two labels of a hostname: `alice.ns.cloudflare.com` -> `cloudflare.com`. */
function nsProvider(host: string): string {
  return host.split(".").slice(-2).join(".");
}

/**
 * True when a nameserver hostname is specific to one customer rather than
 * shared by every customer of a DNS host. Providers that number their
 * nameservers (`ns1.`, `dns2.`) are shared; ones that name them after the
 * account or the domain are not.
 */
function isAccountSpecific(host: string, brand: string): boolean {
  if (SHARED_NS_HOSTS.includes(nsProvider(host))) return false;
  const labels = host.split(".");
  // `ns1.example.com` run on your own domain is account-specific; the same
  // shape run on a hosting provider's domain is not, which the list above
  // already caught.
  const leading = labels[0] ?? "";
  if (brand && host.includes(brand)) return true;
  return !/^(ns|dns|nserver)\d*$/.test(leading);
}

export type OwnerFingerprint = {
  brand: string;
  registrants: Set<string>;
  /** Every nameserver seen across the domains you listed. */
  nameservers: Set<string>;
  /** The subset that identifies an account rather than a hosting provider. */
  identifyingNameservers: Set<string>;
};

/** Builds the profile to compare candidates against, from the domains you own. */
export function fingerprint(
  brand: string,
  ownedRecords: RegistryRecord[],
): OwnerFingerprint {
  const normalisedBrand = brand.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const registrants = new Set<string>();
  const nameservers = new Set<string>();
  const identifyingNameservers = new Set<string>();

  for (const record of ownedRecords) {
    if (record.registrant) registrants.add(normalise(record.registrant));
    for (const host of record.nameservers ?? []) {
      nameservers.add(host);
      if (isAccountSpecific(host, normalisedBrand)) identifyingNameservers.add(host);
    }
  }

  return { brand: normalisedBrand, registrants, nameservers, identifyingNameservers };
}

function overlap(a: Set<string>, b: Iterable<string>): string[] {
  const shared: string[] = [];
  for (const value of b) if (a.has(value)) shared.push(value);
  return shared;
}

/**
 * Compares one registered domain against the fingerprint. `listedDomains` are
 * the ones you said are yours, which need no guessing at all.
 */
export function guessOwnership(
  record: RegistryRecord,
  profile: OwnerFingerprint,
  listedDomains: ReadonlySet<string>,
): OwnershipGuess {
  if (listedDomains.has(record.domain)) {
    return { ownership: "yours", reason: "You listed this domain.", strength: "listed" };
  }

  if (record.registrant && profile.registrants.size) {
    const candidate = normalise(record.registrant);
    if (profile.registrants.has(candidate)) {
      return {
        ownership: "yours",
        reason: `Registrant "${record.registrant}" matches your domains.`,
        strength: "strong",
      };
    }
  }

  const hosts = record.nameservers ?? [];
  const identifying = overlap(profile.identifyingNameservers, hosts);
  if (identifying.length) {
    return {
      ownership: "yours",
      reason: `Uses ${identifying[0]}, a nameserver specific to your account.`,
      strength: "strong",
    };
  }

  const shared = overlap(profile.nameservers, hosts);
  if (shared.length && shared.length === hosts.length) {
    return {
      ownership: "yours",
      reason: `Same nameservers as your domains (${shared[0]}) — but that host is shared by many customers, so check this one.`,
      strength: "weak",
    };
  }

  return {
    ownership: "theirs",
    reason: record.registrant
      ? `Registered to "${record.registrant}".`
      : "No public signal links this to your domains.",
    strength: "none",
  };
}
