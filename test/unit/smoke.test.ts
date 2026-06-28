import { describe, it, expect } from "vitest";

// Phase 0 harness check: confirms the @cloudflare/vitest-pool-workers runtime
// boots and runs a test. Real unit tests (validation, cookie signing, quotas)
// arrive in later phases.
describe("smoke", () => {
  it("runs a test inside the workers pool", () => {
    expect(1 + 1).toBe(2);
  });
});
