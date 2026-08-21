import type { CountryTld, Eligibility } from "@/data/cctlds";

/** What the registry says about the name itself. */
export type Registration = "registered" | "available" | "unknown";

/** Whether a registered domain appears to belong to the person looking. */
export type Ownership = "yours" | "theirs" | "unknown";

/**
 * The five states the globe paints, plus the two transient ones.
 *
 * `restricted` is deliberately separate from `available`: a .fr nobody has
 * taken is still out of reach without an EU address, and that is a different
 * planning decision from a domain you could buy this afternoon.
 */
export type DomainStatus =
  | "owned"
  | "taken"
  | "available"
  | "restricted"
  | "closed"
  | "unknown"
  | "pending";

/** How a result was established, which decides how much to trust it. */
export type LookupSource = "listed" | "rdap" | "dns" | "policy" | "none";

export type DomainResult = {
  iso: string;
  domain: string | null;
  status: DomainStatus;
  source: LookupSource;
  /**
   * `low` marks a result inferred from DNS rather than a registry: an absent
   * DNS record is good evidence a name is unused, but a registered domain that
   * was never delegated looks exactly the same.
   */
  confidence: "high" | "low";
  /** Registrant name or organisation, when the registry publishes one. */
  registrant?: string;
  /** Authoritative nameservers, used both for display and for ownership matching. */
  nameservers?: string[];
  /** Why ownership was guessed the way it was, so the guess can be judged. */
  ownershipReason?: string;
  /** Registry expiry or creation dates, when published. */
  registeredOn?: string;
  expiresOn?: string;
  /** Set when the lookup failed rather than returned a verdict. */
  error?: string;
};

/**
 * Folds registry facts and registry policy into the single status the map
 * paints. Order matters: what is true of the name beats what is true of the
 * registry, so a taken .fr reads as taken rather than restricted.
 */
export function deriveStatus(input: {
  eligibility: Eligibility;
  hasSuffix: boolean;
  registration: Registration;
  ownership: Ownership;
}): DomainStatus {
  if (!input.hasSuffix || input.eligibility === "closed") return "closed";
  if (input.registration === "registered") {
    return input.ownership === "yours" ? "owned" : "taken";
  }
  if (input.registration === "available") {
    return input.eligibility === "restricted" ? "restricted" : "available";
  }
  return "unknown";
}

export type StatusMeta = {
  label: string;
  /** Shown in the legend, under the label. */
  blurb: string;
  /** Fill colour for the map. Hex, because MapLibre paints outside the CSS cascade. */
  color: { light: string; dark: string };
  /** Tailwind classes for the matching badge/swatch in the DOM. */
  swatch: string;
};

/**
 * Map colours are hex literals rather than theme tokens because MapLibre paint
 * properties are resolved by WebGL, not CSS. The light and dark values are
 * tuned to stay distinguishable against the ocean fill in `globe-style.ts`.
 */
export const STATUS_META: Record<DomainStatus, StatusMeta> = {
  owned: {
    label: "Yours",
    blurb: "Registered to you",
    color: { light: "#059669", dark: "#10b981" },
    swatch: "bg-emerald-600 dark:bg-emerald-500",
  },
  taken: {
    label: "Taken",
    blurb: "Registered by someone else",
    color: { light: "#dc2626", dark: "#f87171" },
    swatch: "bg-red-600 dark:bg-red-400",
  },
  available: {
    label: "Free",
    blurb: "Unregistered, open to anyone",
    color: { light: "#0284c7", dark: "#38bdf8" },
    swatch: "bg-sky-600 dark:bg-sky-400",
  },
  restricted: {
    label: "Restricted",
    blurb: "Unregistered, but needs local presence",
    color: { light: "#d97706", dark: "#fbbf24" },
    swatch: "bg-amber-600 dark:bg-amber-400",
  },
  closed: {
    label: "No registry",
    blurb: "Not sold to the public",
    color: { light: "#a1a1aa", dark: "#52525b" },
    swatch: "bg-zinc-400 dark:bg-zinc-600",
  },
  unknown: {
    label: "Unknown",
    blurb: "Registry did not answer",
    color: { light: "#c084fc", dark: "#a855f7" },
    swatch: "bg-purple-400 dark:bg-purple-500",
  },
  pending: {
    label: "Not checked",
    blurb: "Not looked up yet",
    color: { light: "#e4e4e7", dark: "#3f3f46" },
    swatch: "bg-zinc-200 dark:bg-zinc-700",
  },
};

/** Legend order, and the order the summary counts read in. */
export const STATUS_ORDER: DomainStatus[] = [
  "owned",
  "available",
  "restricted",
  "taken",
  "closed",
  "unknown",
  "pending",
];

/** A result for a country that was never worth looking up. */
export function policyResult(country: CountryTld): DomainResult | null {
  if (country.suffix && country.eligibility !== "closed") return null;
  return {
    iso: country.iso,
    domain: null,
    status: "closed",
    source: "policy",
    confidence: "high",
  };
}
