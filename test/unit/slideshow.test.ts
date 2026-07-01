import { describe, it, expect } from "vitest";
import { seededShuffle, indexOfId } from "@/lib/slideshow";

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
