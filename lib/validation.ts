import { sniffImageType, type ImageType } from "./imageType";

export type ValidationFailure = "empty" | "too_large" | "not_an_image";

export type ValidationResult =
  | { ok: true; contentType: ImageType }
  | { ok: false; reason: ValidationFailure };

/**
 * Validate an uploaded file: it must be non-empty, within the size cap, and a
 * real image (verified by magic bytes, not the declared content type).
 */
export function validateImage(bytes: Uint8Array, maxBytes: number): ValidationResult {
  if (bytes.byteLength === 0) return { ok: false, reason: "empty" };
  if (bytes.byteLength > maxBytes) return { ok: false, reason: "too_large" };
  const contentType = sniffImageType(bytes);
  if (!contentType) return { ok: false, reason: "not_an_image" };
  return { ok: true, contentType };
}
