import { describe, it, expect } from "vitest";
import {
  sign,
  verify,
  makeUploadCookie,
  verifyUploadCookie,
  makeSessionCookie,
  verifySessionCookie,
  makeHumanCookie,
  verifyHumanCookie,
  makeHostToken,
  verifyHostToken,
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

describe("session cookie", () => {
  it("accepts a fresh cookie", async () => {
    const cookie = await makeSessionCookie(SECRET, 10_000);
    expect(await verifySessionCookie(cookie, SECRET)).toBe(true);
  });
  it("rejects an expired cookie", async () => {
    const cookie = await makeSessionCookie(SECRET, 10_000);
    expect(await verifySessionCookie(cookie, SECRET, Date.now() + 20_000)).toBe(false);
  });
  it("rejects another secret and a missing cookie", async () => {
    const cookie = await makeSessionCookie(SECRET, 10_000);
    expect(await verifySessionCookie(cookie, "wrong")).toBe(false);
    expect(await verifySessionCookie(undefined, SECRET)).toBe(false);
  });
});

describe("scope isolation", () => {
  it("an upload cookie is not accepted as a session cookie", async () => {
    const upload = await makeUploadCookie(SECRET, 10_000);
    expect(await verifyUploadCookie(upload, SECRET)).toBe(true);
    expect(await verifySessionCookie(upload, SECRET)).toBe(false);
  });
  it("a session cookie is not accepted as an upload cookie", async () => {
    const session = await makeSessionCookie(SECRET, 10_000);
    expect(await verifySessionCookie(session, SECRET)).toBe(true);
    expect(await verifyUploadCookie(session, SECRET)).toBe(false);
  });
  it("a human cookie is not accepted as an upload or session cookie", async () => {
    const human = await makeHumanCookie(SECRET, 10_000);
    expect(await verifyHumanCookie(human, SECRET)).toBe(true);
    expect(await verifyUploadCookie(human, SECRET)).toBe(false);
    expect(await verifySessionCookie(human, SECRET)).toBe(false);
  });
});

describe("host token", () => {
  it("accepts a fresh token for the matching pin", async () => {
    const token = await makeHostToken("1234", SECRET, 10_000);
    expect(await verifyHostToken(token, "1234", SECRET)).toBe(true);
  });
  it("rejects a token for a different pin", async () => {
    const token = await makeHostToken("1234", SECRET, 10_000);
    expect(await verifyHostToken(token, "9999", SECRET)).toBe(false);
  });
  it("rejects expired, wrong-secret, and missing tokens", async () => {
    const token = await makeHostToken("1234", SECRET, 10_000);
    expect(await verifyHostToken(token, "1234", SECRET, Date.now() + 20_000)).toBe(false);
    expect(await verifyHostToken(token, "1234", "wrong")).toBe(false);
    expect(await verifyHostToken(undefined, "1234", SECRET)).toBe(false);
  });
  it("is not accepted as a session/upload cookie", async () => {
    const token = await makeHostToken("1234", SECRET, 10_000);
    expect(await verifySessionCookie(token, SECRET)).toBe(false);
    expect(await verifyUploadCookie(token, SECRET)).toBe(false);
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
