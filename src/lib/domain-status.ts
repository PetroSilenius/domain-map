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
 * Country fills sit transparent over the globe's grey, which knocks the
 * saturation back and lets the statuses read as a set rather than as six
 * unrelated colours — closer to a tint over the map than a sticker on it.
 */
export const FILL_OPACITY = 0.72;
/** Countries filtered out of the legend selection, faded into the ocean. */
export const FILL_OPACITY_DIMMED = 0.12;
/** The country under the cursor comes forward, but stays a tint rather than a block. */
export const FILL_OPACITY_HOVER = 0.9;

/**
 * `#rrggbb` -> HSL -> `#rrggbb`, so "Limited" can be defined as a darker shade
 * of "Available" rather than as a second hex pair that happens to look similar
 * and can drift out of step with it.
 */
function darken(hex: string, lightness: number, saturation = 1): string {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l2 = l * lightness;
  const s2 = s * saturation;
  const c = (1 - Math.abs(2 * l2 - 1)) * s2;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l2 - c / 2;
  const [r2, g2, b2] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}

/** Colours pulled from a code editor's syntax palette — the "modern" the map is going for. */
const AVAILABLE_COLOR = { light: "#0b778e", dark: "#8be9fd" };

export const STATUS_META: Record<DomainStatus, StatusMeta> = {
  owned: {
    label: "Yours",
    blurb: "Registered to you",
    color: { light: "#0b8429", dark: "#50fa7b" },
  },
  taken: {
    label: "Taken",
    blurb: "Registered by someone else",
    color: { light: "#a00d0d", dark: "#ff5555" },
  },
  available: {
    label: "Available",
    blurb: "Unregistered, open to anyone",
    color: AVAILABLE_COLOR,
  },
  restricted: {
    label: "Limited",
    blurb: "Unregistered, but needs local presence",
    color: {
      light: darken(AVAILABLE_COLOR.light, 0.62),
      dark: darken(AVAILABLE_COLOR.dark, 0.5, 0.85),
    },
  },
  closed: {
    label: "No registry",
    blurb: "Not sold to the public",
    // Matches the map's own neutral tones (see globe-style.ts) rather than
    // getting a colour of its own — this status is an absence of data, not a
    // finding.
    color: { light: "#a9a9b2", dark: "#3d3d3d" },
  },
  unknown: {
    label: "Unknown",
    blurb: "Registry did not answer",
    color: { light: "#450c97", dark: "#bd93f9" },
  },
  pending: {
    label: "Not checked",
    blurb: "Not looked up yet",
    // Land with no answer yet: a step in from the ocean, so the continents are
    // visible before the first scan finishes.
    color: { light: "#cbcbd1", dark: "#292929" },
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
