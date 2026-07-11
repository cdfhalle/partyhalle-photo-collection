import { describe, it, expect } from "vitest";
import { seededShuffle, indexOfId, formatSlideMeta, layoutPeopleLabels } from "@/lib/slideshow";

const items = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

describe("seededShuffle", () => {
  it("returns a permutation (same set of ids)", () => {
    const shuffled = seededShuffle(items, 1);
    expect(shuffled.map((i) => i.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("is deterministic for a given seed", () => {
    expect(seededShuffle(items, 7)).toEqual(seededShuffle(items, 7));
  });

  it("adding an item keeps the existing relative order stable", () => {
    const before = seededShuffle(items, 3).map((i) => i.id);
    const withExtra = seededShuffle([...items, { id: "f" }], 3).map((i) => i.id);
    expect(withExtra.filter((id) => id !== "f")).toEqual(before);
  });
});

describe("indexOfId", () => {
  it("finds the index of an id", () => {
    expect(indexOfId(items, "c")).toBe(2);
  });
  it("returns 0 for a missing or empty id", () => {
    expect(indexOfId(items, "zzz")).toBe(0);
    expect(indexOfId(items, null)).toBe(0);
    expect(indexOfId(items, undefined)).toBe(0);
  });
});

describe("formatSlideMeta", () => {
  // 2026-07-11T12:00:00Z — noon-anchored like manual date input.
  const takenAt = Date.UTC(2026, 6, 11, 12);

  it("joins date, place and uploader with · separators", () => {
    expect(
      formatSlideMeta({ takenAt, locationName: "Gartenlokal", uploaderName: "Conrad" }),
    ).toBe("11.07.2026 · Gartenlokal · von Conrad");
  });

  it("shows each field on its own without stray separators", () => {
    expect(formatSlideMeta({ takenAt, locationName: null, uploaderName: null })).toBe(
      "11.07.2026",
    );
    expect(formatSlideMeta({ takenAt: null, locationName: "Halle", uploaderName: null })).toBe(
      "Halle",
    );
    expect(formatSlideMeta({ takenAt: null, locationName: null, uploaderName: "Ulrike" })).toBe(
      "von Ulrike",
    );
    expect(formatSlideMeta({ takenAt: null, locationName: "Halle", uploaderName: "Ulrike" })).toBe(
      "Halle · von Ulrike",
    );
  });

  it("returns null when nothing is available", () => {
    expect(formatSlideMeta({ takenAt: null, locationName: null, uploaderName: null })).toBeNull();
  });
});

describe("layoutPeopleLabels", () => {
  const person = (name: string, x: number, y = 0.5) => ({ name, x, y });

  it("sorts by x and cycles tiers 0→1→2 so neighbors are staggered", () => {
    const labels = layoutPeopleLabels([
      person("c", 0.9),
      person("a", 0.1),
      person("d", 0.95),
      person("b", 0.5),
    ]);
    expect(labels.map((l) => l.person.name)).toEqual(["a", "b", "c", "d"]);
    expect(labels.map((l) => l.tier)).toEqual([0, 1, 2, 0]);
  });

  it("flips the label below the point only near the top edge", () => {
    const labels = layoutPeopleLabels([person("top", 0.2, 0.05), person("mid", 0.8, 0.15)]);
    expect(labels.map((l) => l.below)).toEqual([true, false]);
  });

  it("preserves every person and handles empty input", () => {
    expect(layoutPeopleLabels([])).toEqual([]);
    const many = Array.from({ length: 7 }, (_, i) => person(`p${i}`, i / 10));
    expect(layoutPeopleLabels(many)).toHaveLength(7);
  });
});
