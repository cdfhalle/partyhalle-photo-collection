// Reads runtime configuration from Cloudflare env vars, with safe defaults.

export interface AppConfig {
  /** Per-file size cap in bytes. */
  uploadMaxBytes: number;
  /** Hard backstop on total stored photos, to bound cost/abuse. */
  uploadGlobalCap: number;
  /** ISO timestamp the public window opens (null = already open). */
  uploadOpensAt: string | null;
  /** ISO timestamp the public window closes (null = never closes). */
  uploadClosesAt: string | null;
}

const DEFAULTS: AppConfig = {
  uploadMaxBytes: 25 * 1024 * 1024, // 25 MB — generous for full-res phone photos
  uploadGlobalCap: 5000,
  uploadOpensAt: null,
  uploadClosesAt: null,
};

function positiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function readConfig(env: Record<string, unknown>): AppConfig {
  return {
    uploadMaxBytes: positiveInt(env.UPLOAD_MAX_BYTES, DEFAULTS.uploadMaxBytes),
    uploadGlobalCap: positiveInt(env.UPLOAD_GLOBAL_CAP, DEFAULTS.uploadGlobalCap),
    uploadOpensAt: nonEmptyString(env.UPLOAD_OPENS_AT),
    uploadClosesAt: nonEmptyString(env.UPLOAD_CLOSES_AT),
  };
}
