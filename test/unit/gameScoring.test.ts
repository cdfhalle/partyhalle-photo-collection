import { describe, it, expect } from "vitest";
import { scorePoints } from "@/lib/gameScoring";

describe("scorePoints", () => {
  it("scores 0 for a wrong answer", () => {
    expect(scorePoints(1, 0, 10000, 20000, 1000)).toBe(0);
  });
  it("gives full points for an instant correct answer", () => {
    expect(scorePoints(0, 0, 20000, 20000, 1000)).toBe(1000);
  });
  it("gives half points for a last-second correct answer", () => {
    expect(scorePoints(0, 0, 0, 20000, 1000)).toBe(500);
  });
  it("scales linearly between half and full", () => {
    expect(scorePoints(0, 0, 10000, 20000, 1000)).toBe(750);
  });
  it("clamps out-of-range time and handles zero total", () => {
    expect(scorePoints(0, 0, 99999, 20000, 1000)).toBe(1000);
    expect(scorePoints(0, 0, 5000, 0, 1000)).toBe(500);
  });
});
