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
  /**
   * The one place a status colour is defined. MapLibre paints outside the CSS
   * cascade, so these have to be literals rather than theme tokens — and the
   * DOM reads the same values back through the custom properties emitted by
   * `statusColorStyles()`, so the swatches can never drift from the map.
   */
  color: { light: string; dark: string };
};

/**
 * Country fills sit slightly transparent over the globe's grey, which knocks
 * the saturation back and lets the statuses read as a set rather than as six
 * unrelated colours.
 */
export const FILL_OPACITY = 0.85;
/** Countries filtered out of the legend selection, faded into the ocean. */
export const FILL_OPACITY_DIMMED = 0.14;
/** The country under the cursor comes forward to full strength. */
export const FILL_OPACITY_HOVER = 1;

export const STATUS_META: Record<DomainStatus, StatusMeta> = {
  owned: {
    label: "Yours",
    blurb: "Registered to you",
    color: { light: "#12795b", dark: "#2f9e78" },
  },
  taken: {
    label: "Taken",
    blurb: "Registered by someone else",
    color: { light: "#a33a33", dark: "#c4544c" },
  },
  available: {
    label: "Free",
    blurb: "Unregistered, open to anyone",
    color: { light: "#22649f", dark: "#4a86c9" },
  },
  restricted: {
    label: "Restricted",
    blurb: "Unregistered, but needs local presence",
    color: { light: "#96661c", dark: "#c08a3e" },
  },
  closed: {
    label: "No registry",
    blurb: "Not sold to the public",
    color: { light: "#a9a9b2", dark: "#43434b" },
  },
  unknown: {
    label: "Unknown",
    blurb: "Registry did not answer",
    color: { light: "#5f4aa3", dark: "#7f6ac0" },
  },
  pending: {
    label: "Not checked",
    blurb: "Not looked up yet",
    // Land with no answer yet: a step in from the ocean, so the continents are
    // visible before the first scan finishes.
    color: { light: "#cbcbd1", dark: "#2c2c32" },
  },
};

const ALL_STATUSES = Object.keys(STATUS_META) as DomainStatus[];

/**
 * Emits the palette as custom properties so CSS and MapLibre share one source.
 * Rendered inline in the document head, ahead of first paint.
 */
export function statusColorStyles(): string {
  const declare = (theme: "light" | "dark") =>
    ALL_STATUSES.map((status) => `--status-${status}:${STATUS_META[status].color[theme]}`).join(";");
  return `:root{${declare("light")}}.dark{${declare("dark")}}`;
}

/**
 * Legend order. `pending` is deliberately absent: "not checked" is a state the
 * map passes through, not one worth a row or a filter of its own.
 */
export const STATUS_ORDER: DomainStatus[] = [
  "owned",
  "available",
  "restricted",
  "taken",
  "closed",
  "unknown",
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
