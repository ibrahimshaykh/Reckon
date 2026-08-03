import { describe, it, expect } from "vitest";
import { effortBand, type EffortBand } from "@/lib/effort";

// What the form accepts. The bands are only meaningful over this range, and
// checking them beyond it is what let two of the five words go unreachable
// while a test still reported every band as covered.
const LOWEST = 1;
const HIGHEST = 10;

describe("effortBand", () => {
  it("puts the jobs people actually add where you'd expect", () => {
    // From the real chore list: making tea against cleaning the bathroom.
    expect(effortBand(1)).toBe("easy");
    expect(effortBand(4)).toBe("moderate");
    expect(effortBand(7)).toBe("hard");
  });

  it("covers every value the field accepts", () => {
    for (let weight = LOWEST; weight <= HIGHEST; weight++) {
      expect(effortBand(weight), String(weight)).toBeTruthy();
    }
  });

  it("never gets lighter as the number goes up", () => {
    const order: EffortBand[] = ["easy", "moderate", "hard", "veryHard", "worst"];
    let lowest = 0;

    for (let weight = LOWEST; weight <= HIGHEST; weight++) {
      const rank = order.indexOf(effortBand(weight));
      expect(rank, `effort ${weight}`).toBeGreaterThanOrEqual(lowest);
      lowest = rank;
    }
  });

  it("reaches every word within the range somebody can actually type", () => {
    // The bug this replaces: the old bands needed an 11 for "very hard" and a
    // 26 for "the worst job", so on a 1-10 field two words were decoration and
    // everything from 6 upward read identically.
    const seen = new Set<EffortBand>();
    for (let weight = LOWEST; weight <= HIGHEST; weight++) seen.add(effortBand(weight));

    expect([...seen].sort()).toEqual(
      ["easy", "hard", "moderate", "veryHard", "worst"].sort(),
    );
  });

  it("keeps the worst label for a genuine ten", () => {
    // An extreme word reachable by rating half your chores highly stops
    // meaning anything.
    expect(effortBand(9)).toBe("veryHard");
    expect(effortBand(10)).toBe("worst");
  });

  it("holds up at the boundaries", () => {
    expect(effortBand(2)).toBe("easy");
    expect(effortBand(3)).toBe("moderate");
    expect(effortBand(4)).toBe("moderate");
    expect(effortBand(5)).toBe("hard");
    expect(effortBand(7)).toBe("hard");
    expect(effortBand(8)).toBe("veryHard");
  });

  it("still answers for values stored before the field was capped", () => {
    // Nothing above 10 exists in any group, but old rows must not crash the
    // page if one ever did.
    expect(effortBand(50)).toBe("worst");
  });
});
