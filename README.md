# Domain Map

Check one brand against every country's ccTLD, on a globe.

You own `dataatti.fi`. Where else in the world is `dataatti` still yours to take?
Type the domains you already own, and the map colours all ~250 countries by
whether the matching domain is yours, taken, free, or free-but-restricted.

No account, no database. Your list lives in your browser, and the Share button
puts it in a link.

## The five statuses

| Status | Meaning |
| --- | --- |
| **Yours** | Registered, and it looks like it belongs to you |
| **Taken** | Registered by someone else |
| **Free** | Unregistered, and anyone in the world can register it |
| **Restricted** | Unregistered, but the registry requires local presence — residency, citizenship, a local company, or a national trademark |
| **No registry** | No ccTLD is delegated, or the registry does not sell to the public |

**Restricted** is the one that earns its place. A `.fr` nobody has taken is
still out of reach without an EU address, and `.au` wants an Australian
Business Number. That is a different planning decision from a domain you could
buy this afternoon, so it gets its own colour instead of being lumped in with
"free".

## How a status is decided

Two questions, answered from different sources.

**Is the domain registered?**

- **RDAP** — the registry's structured WHOIS successor, and definitive when it
  exists. Only about 70 of the ~250 ccTLDs publish one; `.se`, `.de`, `.io`,
  `.co`, `.dk`, `.it` and other popular registries do not.
- **DNS** — the fallback. Nameservers at the apex prove a domain is registered.
  Their *absence* is only evidence: a domain can be registered and never
  delegated, and from the outside that looks exactly like a free one. Those
  results are marked low confidence, shown with a `?` in the list, and the
  detail panel says so.

**Is it yours?**

Domains you list are yours by definition. For the rest there is no way to know
without authentication, so the app compares two public signals against your
listed domains: the registrant name, when the registry publishes one, and the
nameservers.

Nameserver matching has a sharp edge. Cloudflare gives each account its own
pair (`isla.ns.cloudflare.com`), so a match is meaningful; DigitalOcean gives
everyone the same three, so a match means nothing. The app tells those cases
apart and reports the weak ones as weak rather than dressing them up. Route 53
is the case it cannot catch at all — it assigns unique nameservers per zone, so
two domains in one AWS account share nothing.

So every verdict is overridable. Open a country, click **It's mine** or **Not
mine**, and the correction travels in the share link.

Registry eligibility rules live in `src/data/cctlds.ts` as a best-effort
snapshot — registries change their policies. Each country links to its IANA
delegation record, which is authoritative about who runs the TLD.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

```bash
npm run build      # production build
npm run lint       # eslint, zero warnings allowed
npm run typecheck  # tsc --noEmit
npm run build:geo  # regenerate the map geometry (see below)
```

## How it is built

- **Next.js 16** (App Router) with **Tailwind CSS 4** and **shadcn/ui**.
- **[mapcn](https://github.com/AnmolSaini16/mapcn)** for the map, in globe
  projection over a tile-less basemap. Countries are one GeoJSON fill layer
  coloured by a MapLibre `match` expression, and a second `match` on
  `fill-opacity` carries the legend filter onto the globe — picking "Free" dims
  everything that is not free rather than only shortening the list.
- The status palette is defined once, in `src/lib/domain-status.ts`. MapLibre
  paints outside the CSS cascade, so the same values are also emitted as custom
  properties into the document head and read back by the swatches in the DOM.
  Country fills sit at 85% opacity over the globe's grey, which keeps six
  colours reading as one set.
- `POST /api/lookup` runs RDAP and DNS lookups server-side (DNS needs the Node
  runtime, and RDAP endpoints do not send CORS headers). It reports registry
  facts only; deciding what is *yours* happens on the client, which keeps the
  route stateless and its answers cacheable.
- A full sweep is ~230 domains. The client sends them in batches of 40, three
  batches in flight, and paints results as they land rather than waiting for
  the whole world.

### Generated files

Two artefacts are generated rather than committed, so they stay in step with
their sources:

- `npm run build:geo` pulls Natural Earth 50m data, simplifies it, and writes
  `public/world.geojson` plus `src/data/country-points.json`. The points file
  exists because a globe cannot render Tuvalu at any useful size — roughly 100
  ccTLDs belong to islands and microstates that are sub-pixel, and those are
  exactly the ones people look for, so they are drawn as dots.
- `scripts/copy-maplibre-worker.mjs` copies MapLibre's web worker into
  `public/`. It runs from `predev`, `prebuild`, and `postinstall`. mapcn
  defaults to loading the worker from unpkg; served from our own origin the map
  no longer depends on a third-party CDN being reachable, which otherwise fails
  silently as an empty canvas.

## Limits worth knowing

- A DNS-only "free" verdict is a strong hint, not a fact. Confirm with a
  registrar before you count on it.
- Ownership detection is a heuristic on public data. Correct it by hand.
- Eligibility rules are a snapshot. Follow the IANA link for the current policy.
- Second-level registries are handled (`dataatti.com.br`, `dataatti.co.za`),
  but a registry that sells at both levels is checked at one.
