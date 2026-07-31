import { describe, it, expect } from "vitest";
import { assignChoresWithTrace, assignChoresForPeriod } from "@/lib/chore-rotation";

// The scenario that starts arguments: a fresh group, one heavy job and one
// light one, and two people who have both done nothing yet.
const FRESH = [
  { userId: "ibrahim", cumulativeEffort: 0 },
  { userId: "lola", cumulativeEffort: 0 },
];
const CHORES = [
  { id: "bathroom", effortWeight: 10 },
  { id: "tea", effortWeight: 4 },
  { id: "bins", effortWeight: 3 },
];

describe("assignChoresWithTrace", () => {
  it("reports the load the rotation actually saw, not the pre-round one", () => {
    const trace = assignChoresWithTrace(CHORES, FRESH);

    // Bathroom (10) goes out first, to someone on 0.
    expect(trace.bathroom.effortBefore).toBe(0);
    // Tea (4) goes to the other person, also on 0.
    expect(trace.tea.effortBefore).toBe(0);
    // Bins (3) goes to whoever is lighter — the tea person, now on 4.
    // Reporting 0 here was the bug: it claimed they had nothing yet.
    expect(trace.bins.effortBefore).toBe(4);
    expect(trace.bins.userId).toBe(trace.tea.userId);
  });

  it("shows the whole round's split, not just one person's slice", () => {
    const trace = assignChoresWithTrace(CHORES, FRESH);

    // 10 against 4 + 3 — as level as three jobs like these can be divided.
    expect(trace.bathroom.roundTotals).toEqual([
      { userId: expect.any(String), effort: 10 },
      { userId: expect.any(String), effort: 7 },
    ]);
    // Every assignment carries the same totals, so any of them can show it.
    expect(trace.tea.roundTotals).toEqual(trace.bathroom.roundTotals);
  });

  it("knows when nobody had any history to catch up on", () => {
    const trace = assignChoresWithTrace(CHORES, FRESH);

    expect(trace.bathroom.firstRound).toBe(true);
  });

  it("stops calling it a first round once anyone has done anything", () => {
    const trace = assignChoresWithTrace(CHORES, [
      { userId: "ibrahim", cumulativeEffort: 12 },
      { userId: "lola", cumulativeEffort: 0 },
    ]);

    expect(trace.bathroom.firstRound).toBe(false);
    // Lola is behind, so the heaviest job is hers to even things up.
    expect(trace.bathroom.userId).toBe("lola");
    expect(trace.bathroom.effortBefore).toBe(0);
  });

  it("keeps the round as even as the jobs allow", () => {
    const { roundTotals } = assignChoresWithTrace(CHORES, FRESH).bathroom;
    const spread =
      roundTotals[0].effort - roundTotals[roundTotals.length - 1].effort;

    // 17 across two people can't be split better than 10/7.
    expect(spread).toBe(3);
  });

  it("gives everyone something to do when there are enough jobs", () => {
    const trace = assignChoresWithTrace(CHORES, FRESH);
    const assignees = new Set(Object.values(trace).map((t) => t.userId));

    expect(assignees.size).toBe(2);
  });

  it("still agrees with the plain version used elsewhere", () => {
    const traced = assignChoresWithTrace(CHORES, FRESH);
    const plain = assignChoresForPeriod(CHORES, FRESH);

    for (const [choreId, trace] of Object.entries(traced)) {
      expect(plain[choreId]).toBe(trace.userId);
    }
  });

  it("has nothing to say when there's nobody to assign to", () => {
    expect(assignChoresWithTrace(CHORES, [])).toEqual({});
  });
});
