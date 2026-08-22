import type { Ownership } from "@/lib/domain-status";

/**
 * Everything the app knows about what you are planning, and the two ways it
 * survives a page load.
 *
 * There is no account and no database. A project lives in `localStorage` for
 * the person who typed it, and in the URL for anyone they send it to — which
 * keeps the tool usable by anyone with the link and leaves nothing to
 * moderate, rate-limit, or delete.
 */
export type Project = {
  /** The label the ccTLD gets appended to: `dataatti` in `dataatti.fi`. */
  brand: string;
  /** Domains you have told the app are yours. Trusted without a lookup. */
  owned: string[];
  /** Corrections to the ownership guess, keyed by ISO country code. */
  overrides: Record<string, Ownership>;
};

export const EMPTY_PROJECT: Project = { brand: "", owned: [], overrides: {} };

const STORAGE_KEY = "domain-map:project";

const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DOMAIN_PATTERN =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function isValidBrand(brand: string): boolean {
  return LABEL_PATTERN.test(brand);
}

/** Accepts what people actually paste: URLs, `www.` prefixes, stray whitespace. */
export function parseDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split(/[/?#]/)[0];
  value = value.replace(/^www\./, "").replace(/\.$/, "");
  return DOMAIN_PATTERN.test(value) ? value : null;
}

/** `dataatti.fi` -> `dataatti`. The brand is everything before the public suffix. */
export function brandFromDomain(domain: string): string {
  return domain.split(".")[0];
}

/** Splits one text field into domains, so a pasted list works as well as typing. */
export function parseDomainList(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\s,;]+/)
        .map(parseDomain)
        .filter((domain): domain is string => domain !== null),
    ),
  ];
}

function sanitise(project: Partial<Project>): Project {
  const brand = (project.brand ?? "").trim().toLowerCase();
  const owned = Array.isArray(project.owned)
    ? [...new Set(project.owned.map(parseDomain).filter((d): d is string => d !== null))]
    : [];
  const overrides: Record<string, Ownership> = {};
  for (const [iso, value] of Object.entries(project.overrides ?? {})) {
    if (/^[A-Z]{2}$/.test(iso) && (value === "yours" || value === "theirs")) {
      overrides[iso] = value;
    }
  }
  return { brand: isValidBrand(brand) ? brand : "", owned, overrides };
}

/**
 * Share links use plain readable parameters rather than an encoded blob, so a
 * link is legible before you open it and editable without this app.
 */
export function toSearchParams(project: Project): URLSearchParams {
  const params = new URLSearchParams();
  if (project.brand) params.set("brand", project.brand);
  if (project.owned.length) params.set("own", project.owned.join(","));

  const mine = Object.entries(project.overrides)
    .filter(([, value]) => value === "yours")
    .map(([iso]) => iso);
  const theirs = Object.entries(project.overrides)
    .filter(([, value]) => value === "theirs")
    .map(([iso]) => iso);
  if (mine.length) params.set("mine", mine.join(","));
  if (theirs.length) params.set("notmine", theirs.join(","));

  return params;
}

export function fromSearchParams(params: URLSearchParams): Project | null {
  const brand = params.get("brand");
  const own = params.get("own");
  if (!brand && !own) return null;

  const overrides: Record<string, Ownership> = {};
  for (const iso of (params.get("mine") ?? "").split(",")) {
    if (iso) overrides[iso.toUpperCase()] = "yours";
  }
  for (const iso of (params.get("notmine") ?? "").split(",")) {
    if (iso) overrides[iso.toUpperCase()] = "theirs";
  }

  const owned = own ? parseDomainList(own) : [];
  return sanitise({
    brand: brand ?? (owned[0] ? brandFromDomain(owned[0]) : ""),
    owned,
    overrides,
  });
}

export function loadProject(): Project | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return sanitise(JSON.parse(stored) as Partial<Project>);
  } catch {
    // Private browsing, blocked site data, or a value from an older version.
    return null;
  }
}

export function saveProject(project: Project): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    // Storage is a convenience here; the URL is the durable copy.
  }
}
