import { describe, it, expect, vi, afterEach } from "vitest";
import { ntfyEnabled, notifyFeedback } from "@/lib/ntfy";

afterEach(() => vi.unstubAllGlobals());

function mockFetch(status = 200) {
  const spy = vi.fn(async () => new Response("", { status }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("ntfyEnabled", () => {
  it("is false when the URL is missing or empty", () => {
    expect(ntfyEnabled(undefined)).toBe(false);
    expect(ntfyEnabled(null)).toBe(false);
    expect(ntfyEnabled("")).toBe(false);
  });
  it("is true when a URL is set", () => {
    expect(ntfyEnabled("https://ntfy.sh/topic")).toBe(true);
  });
});

describe("notifyFeedback", () => {
  it("does nothing when disabled", async () => {
    const spy = mockFetch();
    expect(await notifyFeedback("", { message: "hi" })).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("posts message plus name/email/page context to the topic URL", async () => {
    const spy = mockFetch();
    expect(
      await notifyFeedback("https://ntfy.sh/topic", {
        message: "Der Upload hängt",
        name: "Anna",
        email: "anna@gmx.de",
        page: "/upload",
      }),
    ).toBe(true);

    expect(spy).toHaveBeenCalledOnce();
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ntfy.sh/topic");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("Der Upload hängt\n\n— Anna · anna@gmx.de · /upload");
  });

  it("sends the bare message when name and page are missing", async () => {
    const spy = mockFetch();
    await notifyFeedback("https://ntfy.sh/topic", { message: "SOS" });
    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe("SOS");
  });

  it("authenticates with a bearer token when one is given", async () => {
    const spy = mockFetch();
    await notifyFeedback("https://ntfy.sh/topic", { message: "hi" }, "tk_secret");
    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tk_secret");
  });

  it("sends no Authorization header without a token", async () => {
    const spy = mockFetch();
    await notifyFeedback("https://ntfy.sh/topic", { message: "hi" });
    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("returns false on a non-2xx response", async () => {
    mockFetch(500);
    expect(await notifyFeedback("https://ntfy.sh/topic", { message: "hi" })).toBe(false);
  });

  it("returns false instead of throwing on network errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    expect(await notifyFeedback("https://ntfy.sh/topic", { message: "hi" })).toBe(false);
  });
});
