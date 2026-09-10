import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No ISR/revalidation used anywhere in the app (the two static routes never
// revalidate, and /api/lookup is fully dynamic), so the default config needs
// no KV/R2 incremental-cache binding.
const config = defineCloudflareConfig();

// `opennextjs-cloudflare build` builds the underlying Next.js app by running
// `npm run build` by default. Since the `build` script (package.json) is
// `opennextjs-cloudflare build` itself — so that the Cloudflare Workers
// Build pipeline's build step produces the full `.open-next` output that
// `wrangler deploy` needs — that default would recurse forever, so point it
// at the plain Next.js build instead.
config.buildCommand = "next build";

export default config;
