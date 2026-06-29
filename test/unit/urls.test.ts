import { describe, it, expect } from "vitest";
import { uploadEntryUrl } from "@/lib/urls";

describe("uploadEntryUrl", () => {
  it("builds the capability URL", () => {
    expect(uploadEntryUrl("https://party.example.workers.dev", "tok")).toBe(
      "https://party.example.workers.dev/api/upload/enter?t=tok",
    );
  });

  it("strips a trailing slash and encodes the token", () => {
    expect(uploadEntryUrl("https://x.dev/", "a b/c")).toBe(
      "https://x.dev/api/upload/enter?t=a%20b%2Fc",
    );
  });
});
