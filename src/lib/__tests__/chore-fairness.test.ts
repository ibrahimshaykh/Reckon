import { describe, it, expect } from "vitest";
import { computeFairnessBars } from "@/lib/chore-fairness";

describe("computeFairnessBars", () => {
  it("scales bars relative to whoever completed the most effort", () => {
    const bars = computeFairnessBars([
      { userId: "a", displayName: "Alex", completedEffort: 10 },
      { userId: "b", displayName: "Sam", completedEffort: 5 },
    ]);
    expect(bars).toEqual([
      { userId: "a", displayName: "Alex", completedEffort: 10, barPercent: 100 },
      { userId: "b", displayName: "Sam", completedEffort: 5, barPercent: 50 },
    ]);
  });

  it("gives everyone an empty bar when nobody has completed anything", () => {
    const bars = computeFairnessBars([
      { userId: "a", displayName: "Alex", completedEffort: 0 },
      { userId: "b", displayName: "Sam", completedEffort: 0 },
    ]);
    expect(bars.every((b) => b.barPercent === 0)).toBe(true);
  });

  it("handles a single member", () => {
    const bars = computeFairnessBars([{ userId: "a", displayName: "Alex", completedEffort: 7 }]);
    expect(bars).toEqual([{ userId: "a", displayName: "Alex", completedEffort: 7, barPercent: 100 }]);
  });
});
