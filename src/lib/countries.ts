import points from "@/data/country-points.json";
import { countryTld, type CountryTld } from "@/data/cctlds";

export type Country = CountryTld & {
  /** Representative point, used to fly the globe to a country and to place dots. */
  lon: number;
  lat: number;
  /**
   * True when the country is too small to see or click as a polygon at globe
   * zoom, so it is drawn as a dot instead. Half the world's ccTLDs belong to
   * islands you cannot hit with a mouse.
   */
  dot: boolean;
};

const POINTS = points as Record<string, { lon: number; lat: number; dot: boolean }>;

export const COUNTRIES: Country[] = Object.entries(POINTS)
  .map(([iso, point]) => ({ ...countryTld(iso), ...point }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const COUNTRY_BY_ISO: ReadonlyMap<string, Country> = new Map(
  COUNTRIES.map((country) => [country.iso, country]),
);

/** Countries whose ccTLD can actually be registered, in some form. */
export const REGISTRABLE = COUNTRIES.filter(
  (country) => country.suffix !== null && country.eligibility !== "closed",
);

/**
 * The flag emoji for an ISO code, built from regional indicator symbols.
 * Codes with no assigned flag (Kosovo) render as two letter tiles, which is a
 * reasonable thing to show anyway.
 */
export function flagFor(iso: string): string {
  return String.fromCodePoint(
    ...[...iso.toUpperCase()].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  );
}
