import { describe, it, expect } from "vitest";
import { sniffImageType, extensionFor } from "@/lib/imageType";
import { validateImage } from "@/lib/validation";

function withHeader(header: number[], length = 32): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set(header, 0);
  return bytes;
}

describe("sniffImageType", () => {
  it("detects JPEG", () =>
    expect(sniffImageType(withHeader([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg"));
  it("detects PNG", () =>
    expect(sniffImageType(withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      "image/png",
    ));
  it("detects GIF", () =>
    expect(sniffImageType(withHeader([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif"));
  it("detects WebP", () => {
    const bytes = withHeader([0x52, 0x49, 0x46, 0x46]);
    bytes.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffImageType(bytes)).toBe("image/webp");
  });
  it("detects HEIC", () => {
    const bytes = withHeader([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]); // box size + "ftyp"
    bytes.set([0x68, 0x65, 0x69, 0x63], 8); // brand "heic"
    expect(sniffImageType(bytes)).toBe("image/heic");
  });
  it("rejects non-images", () =>
    expect(sniffImageType(withHeader([0x00, 0x01, 0x02, 0x03]))).toBeNull());
  it("rejects too-short buffers", () =>
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull());
});

describe("validateImage", () => {
  const jpeg = withHeader([0xff, 0xd8, 0xff, 0xe0]);

  it("accepts a valid image within the size cap", () =>
    expect(validateImage(jpeg, 1000)).toEqual({ ok: true, contentType: "image/jpeg" }));
  it("rejects empty", () =>
    expect(validateImage(new Uint8Array(0), 1000)).toEqual({ ok: false, reason: "empty" }));
  it("rejects too large", () =>
    expect(validateImage(jpeg, 4)).toEqual({ ok: false, reason: "too_large" }));
  it("rejects a non-image", () =>
    expect(validateImage(withHeader([1, 2, 3, 4]), 1000)).toEqual({
      ok: false,
      reason: "not_an_image",
    }));
});

describe("extensionFor", () => {
  it("maps content types to file extensions", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/heic")).toBe("heic");
    expect(extensionFor("image/webp")).toBe("webp");
  });
});
