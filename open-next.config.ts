import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No ISR/revalidation used anywhere in the app (the two static routes never
// revalidate, and /api/lookup is fully dynamic), so the default config needs
// no KV/R2 incremental-cache binding.
export default defineCloudflareConfig();
