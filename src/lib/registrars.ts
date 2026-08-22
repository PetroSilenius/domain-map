/**
 * Deep links from a country's result to somewhere you can actually register
 * the name.
 *
 * Three registrars, chosen for different reasons:
 *
 *   Namecheap  the default most people already have an account with. The
 *              target URL is Namecheap's own documented format for linking
 *              to a search result page, and doubles as the base an affiliate
 *              link wraps around once one exists — see `wrapAffiliate` below.
 *   Porkbun    at-cost pricing with no upsell wall, good for a second quote.
 *   101domain  a specialist in exactly the ccTLDs that Namecheap and Porkbun
 *              don't carry — the ones this app marks "Limited" because the
 *              registry wants local presence. 101domain runs a proxy/local-
 *              agent service for many of those, which the two general
 *              registrars above don't.
 *
 * None of these are guaranteed to carry every ccTLD in `cctlds.ts` — a name
 * with real local-presence requirements may still need a registrar based in
 * that country. These are a reasonable first stop, not a promise.
 */

export type RegistrarLink = {
  name: string;
  url: string;
  /** Shown only for the registrars worth a word of context. */
  note?: string;
};

/**
 * Wraps a target URL in an affiliate network's click-tracking link, if one is
 * configured. The env var is a full URL containing the literal placeholder
 * `{url}`, which gets replaced with the encoded target — the shape every
 * affiliate network (Impact, ShareASale, Namecheap's own program) uses for a
 * generic "redirect through us, then to this page" link.
 *
 * Unset by default, so the app ships with plain, honest, non-affiliate links
 * until a real one is dropped in via NEXT_PUBLIC_NAMECHEAP_AFFILIATE_URL.
 */
function wrapAffiliate(target: string): string {
  const template = process.env.NEXT_PUBLIC_NAMECHEAP_AFFILIATE_URL;
  if (!template) return target;
  return template.includes("{url}")
    ? template.replace("{url}", encodeURIComponent(target))
    : target;
}

export function registrarLinks(domain: string): RegistrarLink[] {
  const encoded = encodeURIComponent(domain);
  return [
    {
      name: "Namecheap",
      url: wrapAffiliate(`https://www.namecheap.com/domains/registration/results/?domain=${encoded}`),
    },
    {
      name: "Porkbun",
      url: `https://porkbun.com/checkout/search?q=${encoded}`,
    },
    {
      name: "101domain",
      url: `https://www.101domain.com/domain-availability-search.htm?action=search&root=${encoded}`,
      note: "Specialises in ccTLDs that need a local presence.",
    },
  ];
}
