import { describe, it, expect } from "vitest";
import {
  clampTakenAt,
  parseLat,
  parseLng,
  cleanLocationName,
  sanitizePeople,
  serializePeople,
  parsePeople,
  MAX_PEOPLE,
} from "@/lib/metadata";

describe("clampTakenAt", () => {
  const now = Date.UTC(2026, 6, 1);
  it("accepts a plausible past date", () => {
    const t = Date.UTC(2024, 0, 15);
    expect(clampTakenAt(t, now)).toBe(t);
  });
  it("rejects epoch 0 / pre-1990 and far future", () => {
    expect(clampTakenAt(0, now)).toBeNull();
    expect(clampTakenAt(Date.UTC(2030, 0, 1), now)).toBeNull();
  });
  it("parses numeric strings and rejects junk", () => {
    const t = Date.UTC(2024, 0, 15);
    expect(clampTakenAt(String(t), now)).toBe(t);
    expect(clampTakenAt("not-a-number", now)).toBeNull();
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
