import { describe, it, expect } from "vitest";
import { computeFairnessBars } from "@/lib/chore-fairness";

describe("computeFairnessBars", () => {
  it("scales bars relative to whoever completed the most effort", () => {
    const bars = computeFairnessBars([
      { userId: "a", displayName: "Alex", completedEffort: 10, missed: [] },
      { userId: "b", displayName: "Sam", completedEffort: 5, missed: [] },
    ]);
    expect(bars).toEqual([
      { userId: "a", displayName: "Alex", completedEffort: 10, missed: [], barPercent: 100 },
      { userId: "b", displayName: "Sam", completedEffort: 5, missed: [], barPercent: 50 },
    ]);
  });

  it("gives everyone an empty bar when nobody has completed anything", () => {
    const bars = computeFairnessBars([
      { userId: "a", displayName: "Alex", completedEffort: 0, missed: [] },
      { userId: "b", displayName: "Sam", completedEffort: 0, missed: [] },
    ]);
    expect(bars.every((b) => b.barPercent === 0)).toBe(true);
  });

  it("carries the missed count through untouched", () => {
    // It is reported, never acted on — the bar length must not respond to it,
    // or the app starts punishing on its own account.
    const bars = computeFairnessBars([
      { userId: "a", displayName: "Alex", completedEffort: 10, missed: [] },
      { userId: "b", displayName: "Sam", completedEffort: 10, missed: [{ choreName: "bins", effortWeight: 3, frequency: "WEEKLY", dueOn: "2026-07-30" }] },
    ]);

    expect(bars.map((b) => b.missed.length)).toEqual([0, 1]);
    expect(bars.map((b) => b.barPercent)).toEqual([100, 100]);
  });

  it("handles a single member", () => {
    const bars = computeFairnessBars([
      { userId: "a", displayName: "Alex", completedEffort: 7, missed: [] },
    ]);
    expect(bars).toEqual([
      { userId: "a", displayName: "Alex", completedEffort: 7, missed: [], barPercent: 100 },
    ]);
  });
});
