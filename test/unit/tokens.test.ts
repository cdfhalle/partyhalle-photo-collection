import { describe, it, expect } from "vitest";
import {
  sign,
  verify,
  makeUploadCookie,
  verifyUploadCookie,
  tokenMatches,
  timingSafeEqual,
} from "@/lib/tokens";

const SECRET = "s3cret";

describe("sign / verify", () => {
  it("round-trips a payload", async () => {
    const signed = await sign("hello", SECRET);
    expect(await verify(signed, SECRET)).toBe("hello");
  });
  it("rejects tampering and wrong secret", async () => {
    const signed = await sign("hello", SECRET);
    expect(await verify(signed + "x", SECRET)).toBeNull();
    expect(await verify(signed, "other-secret")).toBeNull();
  });
  it("rejects malformed input", async () => {
    expect(await verify("no-signature", SECRET)).toBeNull();
  });
});

describe("upload capability cookie", () => {
  it("accepts a fresh cookie", async () => {
    const cookie = await makeUploadCookie(SECRET, 10_000);
    expect(await verifyUploadCookie(cookie, SECRET)).toBe(true);
  });
  it("rejects an expired cookie", async () => {
    const cookie = await makeUploadCookie(SECRET, 10_000);
    expect(await verifyUploadCookie(cookie, SECRET, Date.now() + 20_000)).toBe(false);
  });
  it("rejects a cookie signed with another secret", async () => {
    const cookie = await makeUploadCookie(SECRET, 10_000);
    expect(await verifyUploadCookie(cookie, "wrong")).toBe(false);
  });
  it("rejects a missing cookie", async () => {
    expect(await verifyUploadCookie(undefined, SECRET)).toBe(false);
  });
});

describe("tokenMatches / timingSafeEqual", () => {
  it("matches equal tokens", () => expect(tokenMatches("abc", "abc")).toBe(true));
  it("rejects different or missing tokens", () => {
    expect(tokenMatches("abc", "abd")).toBe(false);
    expect(tokenMatches(undefined, "abc")).toBe(false);
    expect(tokenMatches("abc", undefined)).toBe(false);
  });
  it("compares constant-time correctly", () => {
    expect(timingSafeEqual("a", "a")).toBe(true);
    expect(timingSafeEqual("a", "b")).toBe(false);
    expect(timingSafeEqual("a", "aa")).toBe(false);
  });
});
