import { describe, it, expect } from "vitest";
import { computeFairnessBars } from "@/lib/chore-fairness";

describe("computeFairnessBars", () => {
  it("scales bars relative to whoever completed the most effort", () => {
    const bars = computeFairnessBars([
      { userId: "a", displayName: "Alex", completedEffort: 10, missedCount: 0 },
      { userId: "b", displayName: "Sam", completedEffort: 5, missedCount: 0 },
    ]);
    expect(bars).toEqual([
      { userId: "a", displayName: "Alex", completedEffort: 10, missedCount: 0, barPercent: 100 },
      { userId: "b", displayName: "Sam", completedEffort: 5, missedCount: 0, barPercent: 50 },
    ]);
  });

  it("gives everyone an empty bar when nobody has completed anything", () => {
    const bars = computeFairnessBars([
      { userId: "a", displayName: "Alex", completedEffort: 0, missedCount: 0 },
      { userId: "b", displayName: "Sam", completedEffort: 0, missedCount: 0 },
    ]);
    expect(bars.every((b) => b.barPercent === 0)).toBe(true);
  });

  it("carries the missed count through untouched", () => {
    // It is reported, never acted on — the bar length must not respond to it,
    // or the app starts punishing on its own account.
    const bars = computeFairnessBars([
      { userId: "a", displayName: "Alex", completedEffort: 10, missedCount: 0 },
      { userId: "b", displayName: "Sam", completedEffort: 10, missedCount: 9 },
    ]);

    expect(bars.map((b) => b.missedCount)).toEqual([0, 9]);
    expect(bars.map((b) => b.barPercent)).toEqual([100, 100]);
  });

  it("handles a single member", () => {
    const bars = computeFairnessBars([
      { userId: "a", displayName: "Alex", completedEffort: 7, missedCount: 0 },
    ]);
    expect(bars).toEqual([
      { userId: "a", displayName: "Alex", completedEffort: 7, missedCount: 0, barPercent: 100 },
    ]);
  });
});
