/// <reference types="@cloudflare/vitest-pool-workers/types" />

// Type the `env` provided to tests as our generated Cloudflare env (bindings + vars).
declare module "cloudflare:test" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- module augmentation requires an interface
  interface ProvidedEnv extends CloudflareEnv {}
}
