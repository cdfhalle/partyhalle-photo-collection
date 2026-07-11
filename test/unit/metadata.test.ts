import { describe, it, expect } from "vitest";
import {
  parseTakenAt,
  parseLat,
  parseLng,
  cleanLocationName,
  cleanComment,
  normalizeRotation,
  rotatePeople,
  sanitizePeople,
  serializePeople,
  parsePeople,
  takenAtFromDateInput,
  parseSource,
  isLikelyPrintDate,
  PRINT_WINDOW_MS,
  MAX_COMMENT,
  MAX_PEOPLE,
} from "@/lib/metadata";

describe("parseTakenAt", () => {
  it("accepts any calendar date — old scans, epoch 0, the future", () => {
    const t = Date.UTC(2024, 0, 15);
    expect(parseTakenAt(t)).toBe(t);
    expect(parseTakenAt(Date.UTC(1954, 5, 20))).toBe(Date.UTC(1954, 5, 20));
    expect(parseTakenAt(0)).toBe(0);
    expect(parseTakenAt(Date.UTC(2030, 0, 1))).toBe(Date.UTC(2030, 0, 1));
  });
  it("rejects values no Date can represent (they would throw at render)", () => {
    expect(parseTakenAt(8.65e15)).toBeNull();
    expect(parseTakenAt(-8.65e15)).toBeNull();
    expect(parseTakenAt(Infinity)).toBeNull();
  });
  it("parses numeric strings and rejects junk", () => {
    const t = Date.UTC(2024, 0, 15);
    expect(parseTakenAt(String(t))).toBe(t);
    expect(parseTakenAt("not-a-number")).toBeNull();
  });
});

describe("parseLat / parseLng", () => {
  it("accepts in-range coords", () => {
    expect(parseLat(52.52)).toBe(52.52);
    expect(parseLng("13.405")).toBe(13.405);
  });
  it("rejects out-of-range and junk", () => {
    expect(parseLat(91)).toBeNull();
    expect(parseLng(200)).toBeNull();
    expect(parseLat("x")).toBeNull();
  });
});

describe("cleanLocationName", () => {
  it("trims and drops empties", () => {
    expect(cleanLocationName("  Berlin  ")).toBe("Berlin");
    expect(cleanLocationName("   ")).toBeNull();
    expect(cleanLocationName(123)).toBeNull();
  });
});

describe("cleanComment", () => {
  it("trims, clamps to the max length, and drops empties", () => {
    expect(cleanComment("  Prost!  ")).toBe("Prost!");
    expect(cleanComment("x".repeat(MAX_COMMENT + 50))).toHaveLength(MAX_COMMENT);
    expect(cleanComment("   ")).toBeNull();
    expect(cleanComment(123)).toBeNull();
  });
});

describe("normalizeRotation", () => {
  it("passes through the four legal values", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(270)).toBe(270);
  });
  it("wraps out-of-range multiples of 90", () => {
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
  });
  it("falls back to 0 for null, junk and non-90 angles", () => {
    expect(normalizeRotation(null)).toBe(0);
    expect(normalizeRotation(undefined)).toBe(0);
    expect(normalizeRotation("junk")).toBe(0);
    expect(normalizeRotation(45)).toBe(0);
  });
  it("accepts numeric strings (D1 values arrive typed, but stay defensive)", () => {
    expect(normalizeRotation("90")).toBe(90);
  });
});

describe("rotatePeople", () => {
  it("maps coordinates clockwise", () => {
    expect(rotatePeople([{ name: "A", x: 0, y: 0 }], 90)).toEqual([{ name: "A", x: 1, y: 0 }]);
    expect(rotatePeople([{ name: "A", x: 0.25, y: 0.75 }], 90)).toEqual([
      { name: "A", x: 0.25, y: 0.25 },
    ]);
  });
  it("counter-clockwise is the inverse of clockwise", () => {
    const people = [{ name: "A", x: 0.2, y: 0.9 }];
    expect(rotatePeople(rotatePeople(people, 90), -90)).toEqual(people);
  });
  it("four clockwise turns are the identity", () => {
    // Dyadic coordinates, so the 1-x/1-y arithmetic stays float-exact.
    const people = [{ name: "A", x: 0.125, y: 0.625 }];
    const once = (p: typeof people) => rotatePeople(p, 90);
    expect(once(once(once(once(people))))).toEqual(people);
  });
  it("handles an empty list", () => {
    expect(rotatePeople([], 90)).toEqual([]);
  });
});

describe("takenAtFromDateInput", () => {
  it("anchors a valid date at noon", () => {
    expect(takenAtFromDateInput("2024-05-10")).toBe(Date.parse("2024-05-10T12:00:00"));
  });
  it("accepts dates far in the past or future (old scans, planned events)", () => {
    expect(takenAtFromDateInput("1954-06-20")).toBe(Date.parse("1954-06-20T12:00:00"));
    expect(takenAtFromDateInput("2030-01-01")).toBe(Date.parse("2030-01-01T12:00:00"));
  });
  it("returns null for cleared or malformed input", () => {
    expect(takenAtFromDateInput("")).toBeNull();
    expect(takenAtFromDateInput("10.05.2024")).toBeNull();
    expect(takenAtFromDateInput(null)).toBeNull();
  });
  it("rejects impossible calendar dates", () => {
    expect(takenAtFromDateInput("2024-02-31")).toBeNull();
  });
});

describe("sanitizePeople", () => {
  it("keeps named tags, clamps coords, drops nameless", () => {
    const out = sanitizePeople([
      { name: " Anna ", x: 0.5, y: 0.2 },
      { name: "", x: 0.1, y: 0.1 },
      { name: "Bob", x: 2, y: -1 },
    ]);
    expect(out).toEqual([
      { name: "Anna", x: 0.5, y: 0.2 },
      { name: "Bob", x: 1, y: 0 },
    ]);
  });
  it("parses a JSON string and caps the count", () => {
    const many = Array.from({ length: MAX_PEOPLE + 5 }, (_, i) => ({ name: `p${i}`, x: 0.5, y: 0.5 }));
    expect(sanitizePeople(JSON.stringify(many))).toHaveLength(MAX_PEOPLE);
    expect(sanitizePeople("not json")).toEqual([]);
  });
  it("round-trips through serialize/parse", () => {
    const people = sanitizePeople([{ name: "Cara", x: 0.3, y: 0.7 }]);
    const json = serializePeople(people);
    expect(parsePeople(json)).toEqual(people);
    expect(serializePeople([])).toBeNull();
    expect(parsePeople(null)).toEqual([]);
  });
});

describe("parseSource", () => {
  it("passes the two known sources through", () => {
    expect(parseSource("exif")).toBe("exif");
    expect(parseSource("manual")).toBe("manual");
  });
  it("rejects anything else from the client", () => {
    expect(parseSource("EXIF")).toBeNull();
    expect(parseSource("")).toBeNull();
    expect(parseSource(null)).toBeNull();
    expect(parseSource(42)).toBeNull();
  });
});

describe("isLikelyPrintDate", () => {
  const now = Date.UTC(2026, 6, 11, 18);
  it("flags capture times inside the print window, including the future", () => {
    expect(isLikelyPrintDate(now, now)).toBe(true);
    expect(isLikelyPrintDate(now - PRINT_WINDOW_MS + 1, now)).toBe(true);
    // A future EXIF date is a wrong camera clock, never a real old photo.
    expect(isLikelyPrintDate(now + 86_400_000, now)).toBe(true);
  });
  it("keeps genuinely old capture times", () => {
    expect(isLikelyPrintDate(now - PRINT_WINDOW_MS, now)).toBe(false);
    expect(isLikelyPrintDate(Date.UTC(1994, 4, 1), now)).toBe(false);
  });
});
