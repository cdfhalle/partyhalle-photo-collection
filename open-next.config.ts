import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal config: no incremental cache override needed for this app
// (no ISR / on-demand revalidation in scope).
export default defineCloudflareConfig({});
