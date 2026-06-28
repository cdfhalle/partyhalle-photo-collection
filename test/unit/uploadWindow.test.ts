import { describe, it, expect } from "vitest";
import { isUploadOpen } from "@/lib/uploadWindow";

const now = Date.parse("2026-06-15T12:00:00Z");

describe("isUploadOpen", () => {
  it("is open when there are no bounds", () => expect(isUploadOpen(now)).toBe(true));
  it("is closed before opensAt", () =>
    expect(isUploadOpen(now, "2026-06-20T00:00:00Z")).toBe(false));
  it("is open after opensAt", () =>
    expect(isUploadOpen(now, "2026-06-01T00:00:00Z")).toBe(true));
  it("is closed after closesAt", () =>
    expect(isUploadOpen(now, null, "2026-06-10T00:00:00Z")).toBe(false));
  it("is open before closesAt", () =>
    expect(isUploadOpen(now, null, "2026-06-20T00:00:00Z")).toBe(true));
  it("ignores empty-string bounds", () => expect(isUploadOpen(now, "", "")).toBe(true));
});
