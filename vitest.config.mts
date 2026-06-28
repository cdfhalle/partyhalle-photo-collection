import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

// Unit tests run inside the Workers runtime (workerd) so server logic can use
// the same Cloudflare bindings (D1, R2, ...) as production, backed by local
// Miniflare.
//
// As of @cloudflare/vitest-pool-workers 0.16 (the vitest 4 line), the pool is
// configured via the `cloudflareTest` Vite plugin rather than the old
// `poolOptions.workers` / `defineWorkersProject` API.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    include: ["test/unit/**/*.test.ts"],
  },
});
