import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyTurnstile, turnstileEnabled } from "@/lib/turnstile";

afterEach(() => vi.unstubAllGlobals());

function mockFetch(result: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(result), { status: 200 })),
  );
}

describe("turnstileEnabled", () => {
  it("is false when the secret is missing or empty", () => {
    expect(turnstileEnabled(undefined)).toBe(false);
    expect(turnstileEnabled(null)).toBe(false);
    expect(turnstileEnabled("")).toBe(false);
  });
  it("is true when a secret is set", () => {
    expect(turnstileEnabled("secret")).toBe(true);
  });
});

describe("verifyTurnstile", () => {
  it("passes through when disabled (no secret) without a token", async () => {
    expect(await verifyTurnstile(null, undefined)).toBe(true);
  });

  it("rejects a missing token when enabled", async () => {
    expect(await verifyTurnstile(null, "secret")).toBe(false);
  });

  it("returns true when siteverify reports success", async () => {
    mockFetch({ success: true });
    expect(await verifyTurnstile("token", "secret")).toBe(true);
  });

  it("returns false when siteverify reports failure", async () => {
    mockFetch({ success: false });
    expect(await verifyTurnstile("token", "secret")).toBe(false);
  });

  it("returns false when siteverify throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    expect(await verifyTurnstile("token", "secret")).toBe(false);
  });
});
