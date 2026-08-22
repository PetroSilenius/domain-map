import { forEachWithConcurrency, lookupDomain } from "@/lib/registry-lookup";

/**
 * Registry facts for a list of domains, streamed back one line of JSON per
 * domain as each lookup finishes.
 *
 * Deliberately dumb: it reports what RDAP, DNS, and (as a last resort) WHOIS
 * say and nothing more. Deciding which of the registered domains are *yours*
 * happens on the client, against the domains you listed, so this route stays
 * stateless and its answers are the same for everyone — which is what makes
 * caching them safe.
 *
 * Streaming rather than collecting into one JSON body matters at this scale:
 * a full world scan is ~230 domains against registries that answer at wildly
 * different speeds, from under 100ms to a multi-second timeout. A single
 * blocking response waits for the slowest domain in the whole request before
 * showing anything; NDJSON lets the globe start painting as soon as the
 * first lookup lands, which for most requests is well under a second.
 */

// DNS lookups need the Node runtime.
export const runtime = "nodejs";

/**
 * Generous rather than tight: streaming means the response body was never the
 * bottleneck this guarded against. It's still a public, unauthenticated
 * route, so a cap stays — just one sized for "one request covers the whole
 * world" (~240 registrable ccTLDs) rather than for keeping a blocking
 * response small.
 */
const MAX_DOMAINS_PER_REQUEST = 300;
/** In-flight lookups at once. Registry-polite, and fast enough that a full scan streams in a handful of seconds. */
const CONCURRENCY = 12;
/**
 * Hard ceiling on how long this request stays open, regardless of how many
 * domains it was given or how slow individual lookups turn out to be. A
 * domain with no RDAP server that also stalls on DNS can burn most of two
 * timeouts (DNS, then the WHOIS fallback) before answering — call it worth
 * up to ~17s in a genuinely bad case. Serverless hosts kill a function
 * outright past their own execution limit (some default to as little as
 * 10s), and a hard kill drops the connection with no chance to close the
 * stream cleanly, which the client reads as every domain it hadn't heard
 * back on yet failing at once. Closing the stream ourselves comfortably
 * before that point means the client instead sees a clean end-of-stream and
 * marks only whatever's left in *this* request as unknown — a graceful,
 * bounded degradation instead of a hard failure.
 */
const REQUEST_DEADLINE_MS = 9_000;

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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };
      // Lookups still in flight when this fires are abandoned as far as this
      // response is concerned, but keep running to completion in the
      // background — lookupDomain's own cache means that work isn't wasted,
      // it just benefits whichever request asks for that domain next.
      const deadline = setTimeout(close, REQUEST_DEADLINE_MS);

      try {
        await forEachWithConcurrency(domains, CONCURRENCY, lookupDomain, (record) => {
          if (closed) return; // past the deadline; enqueueing on a closed stream throws
          controller.enqueue(encoder.encode(`${JSON.stringify(record)}\n`));
        });
      } finally {
        // lookupDomain never rejects (it catches internally and resolves an
        // "unknown" record), so there is no error path here worth a distinct
        // signal to the client — a line simply never arriving for a domain
        // is itself the only failure mode, and the client already handles
        // that by filling in what it never received once the stream ends.
        clearTimeout(deadline);
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      // Best-effort hint for reverse proxies (e.g. nginx) that would
      // otherwise buffer the whole response before forwarding it, silently
      // turning this back into a blocking request.
      "x-accel-buffering": "no",
    },
  });
}
