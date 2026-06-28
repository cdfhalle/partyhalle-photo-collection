import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Pin the workspace root so Next.js doesn't infer it from an unrelated
  // package-lock.json higher up the filesystem (e.g. one in the home dir).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;

// Enables Cloudflare bindings (D1, R2, Images, ...) inside `next dev`
// via the OpenNext Cloudflare adapter.
initOpenNextCloudflareForDev();
