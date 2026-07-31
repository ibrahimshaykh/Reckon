import { describe, it, expect } from "vitest";
import { effortBand, type EffortBand } from "@/lib/effort";

describe("effortBand", () => {
  it("puts the jobs people actually add where you'd expect", () => {
    expect(effortBand(1)).toBe("easy");
    // From the real chore list: making tea vs cleaning the bathroom.
    expect(effortBand(4)).toBe("moderate");
    expect(effortBand(10)).toBe("hard");
  });

  it("covers the whole range the field accepts", () => {
    for (let weight = 1; weight <= 100; weight++) {
      expect(effortBand(weight), String(weight)).toBeTruthy();
    }
  });

  it("never gets lighter as the number goes up", () => {
    const order: EffortBand[] = ["easy", "moderate", "hard", "veryHard", "worst"];
    let lowest = 0;

    for (let weight = 1; weight <= 100; weight++) {
      const rank = order.indexOf(effortBand(weight));
      expect(rank, `effort ${weight}`).toBeGreaterThanOrEqual(lowest);
      lowest = rank;
    }
  });

  it("uses every band, so none of the words are unreachable", () => {
    const seen = new Set<EffortBand>();
    for (let weight = 1; weight <= 100; weight++) seen.add(effortBand(weight));

    expect([...seen].sort()).toEqual(
      ["easy", "hard", "moderate", "veryHard", "worst"].sort(),
    );
  });

  it("holds up at the boundaries", () => {
    expect(effortBand(2)).toBe("easy");
    expect(effortBand(3)).toBe("moderate");
    expect(effortBand(5)).toBe("moderate");
    expect(effortBand(6)).toBe("hard");
    expect(effortBand(11)).toBe("veryHard");
    expect(effortBand(25)).toBe("veryHard");
    expect(effortBand(26)).toBe("worst");
    expect(effortBand(100)).toBe("worst");
  });
});
