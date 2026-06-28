import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Access the Cloudflare bindings + vars/secrets from inside route handlers and
// server components. Pure logic lives in the other lib/* files (no OpenNext
// import) so it stays unit-testable in the Workers test pool.
export function cfEnv(): CloudflareEnv {
  return getCloudflareContext().env;
}
