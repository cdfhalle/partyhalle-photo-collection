// Pure parsing/validation for the per-photo quiz metadata (when/where/who).
// No bindings, so it stays unit-testable in the Workers test pool. Everything
// here is defensive: inputs come from the client and are never trusted.

export interface Person {
  name: string;
  x: number; // normalized 0-1 position on the image
  y: number;
}

export const MAX_PEOPLE = 30;
export const MAX_PERSON_NAME = 60;
export const MAX_LOCATION_NAME = 80;
// Mirrors the upload route's own MAX_COMMENT (app/api/upload/route.ts keeps a
// local copy so that live-critical file has no new imports to pick up).
export const MAX_COMMENT = 280;

/** Clockwise display rotation in 90° steps, applied after EXIF orientation. */
export type Rotation = 0 | 90 | 180 | 270;

// The runtime's representable Date range (±100M days around the epoch).
// Values outside it would make toISOString()/Intl formatting throw at render
// time, so they can never be stored.
const MAX_DATE_MS = 8.64e15;

function finite(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * An EXIF/edited capture time as an epoch-ms number, or null if it is not a
 * representable date. Any calendar date is accepted — old scans can predate
 * the party by decades, so there is no plausibility window.
 */
export function parseTakenAt(value: unknown): number | null {
  const n = finite(value);
  if (n === null) return null;
  const ms = Math.round(n);
  return Math.abs(ms) <= MAX_DATE_MS ? ms : null;
}

/** A latitude/longitude, or null if missing/out of range. */
export function parseLat(value: unknown): number | null {
  const n = finite(value);
  return n !== null && n >= -90 && n <= 90 ? n : null;
}
export function parseLng(value: unknown): number | null {
  const n = finite(value);
  return n !== null && n >= -180 && n <= 180 ? n : null;
}

/** Trim + clamp a free-text location name, or null if empty. */
export function cleanLocationName(value: unknown, max = MAX_LOCATION_NAME): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length ? trimmed : null;
}

/** Trim + clamp a free-text comment, or null if empty. */
export function cleanComment(value: unknown, max = MAX_COMMENT): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length ? trimmed : null;
}

/** Coerce a stored/derived rotation to one of the four legal values. */
export function normalizeRotation(value: unknown): Rotation {
  const n = finite(value);
  if (n === null) return 0;
  const wrapped = ((Math.round(n) % 360) + 360) % 360;
  return wrapped === 90 || wrapped === 180 || wrapped === 270 ? wrapped : 0;
}

/**
 * Rewrite people coordinates when the displayed image rotates by 90° (cw) or
 * -90° (ccw), so pins keep pointing at the same faces. Coordinates are
 * normalized 0-1, so no image dimensions are needed.
 */
export function rotatePeople(people: Person[], delta: 90 | -90): Person[] {
  return people.map((p) =>
    delta === 90 ? { ...p, x: 1 - p.y, y: p.x } : { ...p, x: p.y, y: 1 - p.x },
  );
}

/**
 * An edited "YYYY-MM-DD" date-input value as a taken_at epoch, or null when
 * cleared/malformed. Anchored at local noon like the upload form, so the date
 * survives UTC-vs-local rendering differences.
 */
export function takenAtFromDateInput(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = parseTakenAt(Date.parse(`${value}T12:00:00`));
  if (ms === null) return null;
  // V8's lenient parser rolls impossible dates over (Feb 31 → Mar 2) instead
  // of failing; reading the local calendar date back catches that.
  const d = new Date(ms);
  const roundTrip = [
    String(d.getFullYear()).padStart(4, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
  return roundTrip === value ? ms : null;
}

/** Validate/clamp a people list (from a parsed array or a JSON string). */
export function sanitizePeople(input: unknown): Person[] {
  let arr: unknown = input;
  if (typeof input === "string") {
    try {
      arr = JSON.parse(input);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: Person[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, MAX_PERSON_NAME) : "";
    if (!name) continue;
    const x = finite(r.x);
    const y = finite(r.y);
    out.push({ name, x: x === null ? 0.5 : clamp01(x), y: y === null ? 0.5 : clamp01(y) });
    if (out.length >= MAX_PEOPLE) break;
  }
  return out;
}

/** Serialize people to a JSON string for D1, or null when empty. */
export function serializePeople(people: Person[]): string | null {
  return people.length ? JSON.stringify(people) : null;
}

/** Parse the people JSON stored in a photo row back into a typed list. */
export function parsePeople(stored: string | null | undefined): Person[] {
  if (!stored) return [];
  return sanitizePeople(stored);
}
