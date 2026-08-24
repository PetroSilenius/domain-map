/**
 * Registration policy for every ccTLD, keyed by ISO 3166-1 alpha-2 code.
 *
 * Most ccTLDs follow two conventions: the TLD is the country code in
 * lowercase, and anyone in the world may register one. Only the exceptions are
 * listed in `OVERRIDES` below — everything else is derived.
 *
 * Eligibility is what makes this table worth having. A domain being
 * unregistered does not mean you can have it: .fr wants an EU address, .au
 * wants an Australian business number, .ca wants Canadian presence. Those are
 * a different answer to "can I expand here?" than an openly available domain,
 * so they get their own status on the map.
 *
 * This is a best-effort snapshot of registry policy, not legal advice, and
 * registries change their rules. `ianaUrl()` links to the authoritative
 * delegation record for a TLD so a reader can check the current policy.
 */

/** Whether the country's registry will sell you a domain at all. */
export type Eligibility =
  /** Anyone, anywhere, can register. */
  | "open"
  /** Registrable, but only if you meet a residency, citizenship, company, or trademark requirement. */
  | "restricted"
  /** Not available for general registration — reserved, retired, or suspended. */
  | "closed";

export type CountryTld = {
  /** ISO 3166-1 alpha-2 code. */
  iso: string;
  /** English country name. */
  name: string;
  /** The ccTLD itself, without a leading dot. `null` when none is delegated. */
  tld: string | null;
  /**
   * What actually gets appended to a brand name. Usually the same as `tld`,
   * but some registries only sell at the second level (`com.br`, `co.za`).
   */
  suffix: string | null;
  eligibility: Eligibility;
  /** Why registration is restricted or closed. Absent when eligibility is open. */
  note?: string;
};

type Override = {
  tld?: string | null;
  suffix?: string;
  eligibility?: Eligibility;
  note?: string;
};

const RESTRICTED = "restricted" as const;
const CLOSED = "closed" as const;

/** Shorthand for the common case: registrable, but only with a local nexus. */
function local(note: string, suffix?: string): Override {
  return { eligibility: RESTRICTED, note, suffix };
}

function shut(note: string): Override {
  return { eligibility: CLOSED, note };
}

const OVERRIDES: Record<string, Override> = {
  // --- Europe ---
  AD: local("Andorran company, resident, or a trademark registered in Andorra."),
  AL: local("Albanian entity, or a trademark valid in Albania.", "com.al"),
  AX: local("A demonstrable connection to Åland."),
  BA: local("Bosnian registered entity."),
  BY: local("Belarusian presence."),
  CY: local("Cypriot company, resident, or trademark holder.", "com.cy"),
  DE: local("An administrative contact with a German postal address."),
  FR: local("Residence or an establishment in the EU, EEA, Switzerland, or the UK."),
  GB: { tld: "uk", suffix: "uk" }, // .gb is delegated but unused; the UK registers under .uk
  HR: local("Croatian citizen or a company registered in Croatia."),
  HU: local("EU presence, or a Hungarian tax number."),
  IE: local("A real and substantive connection to Ireland."),
  IT: local("Residence in the EU, EEA, Switzerland, Norway, San Marino, or Vatican City."),
  MC: local("Monegasque company or a trademark registered in Monaco."),
  MK: local("North Macedonian registered entity."),
  MT: local("Maltese presence, or a trademark valid in Malta.", "com.mt"),
  NO: local("A Norwegian organisation number (or Norwegian residency for priv.no)."),
  SJ: shut("Delegated to Norway but never opened for registration."),
  BV: shut("Delegated to Norway but never opened for registration."),
  SK: local("Presence in the EU or EEA."),
  SM: local("San Marino company, resident, or trademark holder."),
  UA: local(
    "A trademark valid in Ukraine (or a WIPO member country) matching the name exactly — third-level domains like com.ua don't need one.",
  ),
  VA: shut("Reserved for the Holy See; no public registration."),
  XK: { tld: null, suffix: undefined, eligibility: CLOSED, note: "No ccTLD has been delegated for Kosovo." },

  // --- Americas ---
  AR: local("Argentine residency or a locally registered entity."),
  BB: local("Barbadian presence.", "com.bb"),
  BM: local("Bermudian company, or a trademark registered in Bermuda."),
  BO: local("Bolivian presence.", "com.bo"),
  BR: local("A Brazilian CPF or CNPJ and a local contact.", "com.br"),
  BS: local("Bahamian presence.", "com.bs"),
  CA: local("Canadian Presence Requirements: citizen, resident, or Canadian entity."),
  CR: local("Costa Rican presence.", "co.cr"),
  CU: shut("Not available to registrants outside Cuba."),
  FK: local("Falkland Islands presence.", "co.fk"),
  GT: local("Guatemalan presence.", "com.gt"),
  JM: local("Jamaican presence.", "com.jm"),
  KY: local("Cayman Islands company or trademark holder.", "com.ky"),
  PA: local("Panamanian presence.", "com.pa"),
  PY: local("Paraguayan presence.", "com.py"),
  SV: local("Salvadoran presence.", "com.sv"),
  US: local("US Nexus: a US citizen, resident, or an organisation with a US presence."),
  UY: local("Uruguayan presence.", "com.uy"),
  VE: local("Venezuelan presence.", "com.ve"),
  UM: shut("Retired; no registrations accepted."),

  // --- Asia & Middle East ---
  AE: local("A UAE trade licence or other local presence."),
  BD: local("Bangladeshi documentation.", "com.bd"),
  BH: local("Bahraini commercial registration.", "com.bh"),
  BN: local("Bruneian registered business.", "com.bn"),
  BT: local("Bhutanese presence."),
  CN: local("Real-name verification; hosting in China additionally needs an ICP licence."),
  EG: local("Egyptian commercial registration.", "com.eg"),
  ID: local("Indonesian identity documents.", "co.id"),
  IQ: local("Iraqi presence.", "com.iq"),
  IR: local("Iranian presence."),
  JO: local("Jordanian commercial registration.", "com.jo"),
  JP: local("A Japanese postal address."),
  KH: local("Cambodian registered business.", "com.kh"),
  KP: shut("No public registration."),
  KR: local("A South Korean postal address."),
  KW: local("Kuwaiti commercial licence.", "com.kw"),
  KZ: local("Kazakhstani presence."),
  LB: local("Lebanese registered entity.", "com.lb"),
  MM: local("Myanmar registered business.", "com.mm"),
  MY: local("Malaysian presence.", "com.my"),
  NP: local("Nepali documentation.", "com.np"),
  OM: local("Omani commercial registration.", "com.om"),
  PK: local("Pakistani documentation.", "com.pk"),
  QA: local("Qatari commercial registration.", "com.qa"),
  SA: local("Saudi entity, or a trademark registered in Saudi Arabia.", "com.sa"),
  SG: local("A Singapore-based administrative contact."),
  SY: local("Syrian presence.", "com.sy"),
  TH: local("A Thai company, or a trademark registered in Thailand.", "co.th"),
  TR: local("Turkish company registration or a matching trademark.", "com.tr"),
  YE: local("Yemeni presence.", "com.ye"),

  // --- Africa ---
  AO: local("Angolan registered entity.", "co.ao"),
  BW: local("Botswanan presence.", "co.bw"),
  CF: shut("Registry suspended new registrations."),
  DJ: local("Djiboutian presence."),
  DZ: local("Algerian presence.", "com.dz"),
  EH: shut("Delegated on paper only; no registry operates it."),
  ER: shut("No public registration."),
  ET: local("Ethiopian registered business.", "com.et"),
  GM: local("Gambian presence."),
  GQ: shut("Registry suspended new registrations."),
  KM: local("Comorian presence."),
  MR: local("Mauritanian presence."),
  NE: local("Nigerien presence."),
  SD: local("Sudanese presence.", "com.sd"),
  SS: local("South Sudanese presence.", "com.ss"),
  TD: local("Chadian presence."),
  TN: local("Tunisian presence.", "com.tn"),
  ZA: { suffix: "co.za" }, // open to anyone, but only sold at the second level
  ZW: local("Zimbabwean presence.", "co.zw"),

  // --- French overseas collectivities (AFNIC and local registries) ---
  GF: local("Presence in French Guiana or the EU."),
  GP: local("Presence in Guadeloupe or the EU."),
  MQ: local("Presence in Martinique or the EU."),
  NC: local("New Caledonian registered entity."),
  PF: local("French Polynesian registered entity."),
  PM: local("Residence or an establishment in the EU, EEA, Switzerland, or the UK."),
  RE: local("Residence or an establishment in the EU, EEA, Switzerland, or the UK."),
  TF: local("Residence or an establishment in the EU, EEA, Switzerland, or the UK."),
  WF: local("Residence or an establishment in the EU, EEA, Switzerland, or the UK."),
  YT: local("Residence or an establishment in the EU, EEA, Switzerland, or the UK."),

  // --- Oceania & remaining territories ---
  AQ: local("A connection to an Antarctic Treaty programme or expedition."),
  AU: local("An Australian Business Number, company number, or Australian trademark."),
  BQ: shut("Delegated to Bonaire but not open for registration."),
  FJ: { suffix: "com.fj" },
  GU: local("Guam presence."),
  PG: local("Papua New Guinean registered business.", "com.pg"),
  PN: local("The Pitcairn registry accepts applications case by case."),
  TK: shut("Registry suspended new registrations."),
};

/**
 * Kosovo is not in the CLDR region list, so `Intl.DisplayNames` echoes the code
 * back instead of a name.
 */
const NAME_FALLBACKS: Record<string, string> = { XK: "Kosovo" };

let displayNames: Intl.DisplayNames | undefined;

function countryName(iso: string): string {
  if (NAME_FALLBACKS[iso]) return NAME_FALLBACKS[iso];
  displayNames ??= new Intl.DisplayNames(["en"], { type: "region" });
  return displayNames.of(iso) ?? iso;
}

/** The IANA delegation record — the authoritative source for who runs a TLD. */
export function ianaUrl(tld: string): string {
  return `https://www.iana.org/domains/root/db/${tld}.html`;
}

/** Builds the full record for one country, applying defaults then overrides. */
export function countryTld(iso: string): CountryTld {
  const override = OVERRIDES[iso] ?? {};
  const tld = override.tld === undefined ? iso.toLowerCase() : override.tld;
  return {
    iso,
    name: countryName(iso),
    tld,
    suffix: tld === null ? null : (override.suffix ?? tld),
    eligibility: override.eligibility ?? "open",
    ...(override.note ? { note: override.note } : {}),
  };
}

/** `dataatti` + `FI` -> `dataatti.fi`. Returns null when the country has no registry. */
export function domainFor(brand: string, country: CountryTld): string | null {
  if (!country.suffix) return null;
  return `${brand}.${country.suffix}`;
}
