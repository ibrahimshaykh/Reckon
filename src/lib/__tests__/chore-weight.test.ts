import { describe, it, expect } from "vitest";
import {
  weightedEffort,
  timesPerWeek,
  frequencyMultiplier,
  type ChoreFrequency,
} from "@/lib/chore-weight";
import { assignChoresWithTrace } from "@/lib/chore-rotation";

const ALL: ChoreFrequency[] = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"];

describe("weightedEffort", () => {
  // The case that exposed the flaw: one daily chore against two weekly ones,
  // all worth 10. The app called it 10 against 20 and thought the person with
  // the daily job had the lighter deal.
  it("counts a daily chore as seven weekly ones", () => {
    expect(weightedEffort(10, "DAILY")).toBe(weightedEffort(70, "WEEKLY"));
  });

  it("makes one daily 10 outweigh two weekly 10s", () => {
    const daily = weightedEffort(10, "DAILY");
    const twoWeekly = weightedEffort(10, "WEEKLY") * 2;

    expect(daily).toBeGreaterThan(twoWeekly);
    // 70 a week against 20 — three and a half times the work.
    expect(daily / twoWeekly).toBeCloseTo(3.5);
  });

  it("halves for biweekly and quarters again for monthly", () => {
    expect(weightedEffort(8, "WEEKLY")).toBe(weightedEffort(16, "BIWEEKLY"));
    expect(weightedEffort(8, "BIWEEKLY")).toBe(weightedEffort(16, "MONTHLY"));
  });

  it("keeps the order daily > weekly > biweekly > monthly", () => {
    const weights = ALL.map((f) => weightedEffort(10, f));

    expect(weights).toEqual([...weights].sort((a, b) => b - a));
    expect(new Set(weights).size).toBe(ALL.length);
  });

  // These get summed into running totals, so a fraction anywhere would drift.
  it("stays a whole number for every frequency and effort the field allows", () => {
    for (const frequency of ALL) {
      for (let effort = 1; effort <= 100; effort++) {
        expect(Number.isInteger(weightedEffort(effort, frequency))).toBe(true);
      }
    }
  });

  it("scales straight with effort", () => {
    expect(weightedEffort(2, "DAILY")).toBe(weightedEffort(1, "DAILY") * 2);
    expect(weightedEffort(0, "DAILY")).toBe(0);
  });

  it("reports the multiplier people will read in the explanation", () => {
    expect(frequencyMultiplier("DAILY")).toBe(7);
    expect(frequencyMultiplier("WEEKLY")).toBe(1);
    expect(timesPerWeek("BIWEEKLY")).toBe(0.5);
  });
});

describe("rotation with frequency weighting", () => {
  // The exact situation from the live group: three chores worth 10, two of
  // them weekly and one daily, dealt to two people.
  it("gives the daily chore to whoever is behind, not to whoever is ahead", () => {
    const chores = [
      { id: "weekly-a", effortWeight: weightedEffort(10, "WEEKLY") },
      { id: "weekly-b", effortWeight: weightedEffort(10, "WEEKLY") },
      { id: "daily", effortWeight: weightedEffort(10, "DAILY") },
    ];

    const trace = assignChoresWithTrace(chores, [
      { userId: "ibrahim", cumulativeEffort: 0 },
      { userId: "lola", cumulativeEffort: 0 },
    ]);

    // The daily one is now by far the heaviest, so it goes out first and the
    // other person picks up both weekly chores to compensate.
    expect(trace.daily.userId).not.toBe(trace["weekly-a"].userId);
    expect(trace["weekly-a"].userId).toBe(trace["weekly-b"].userId);
  });

  it("no longer treats a daily and a weekly chore as interchangeable", () => {
    const unweighted = assignChoresWithTrace(
      [
        { id: "daily", effortWeight: 10 },
        { id: "weekly", effortWeight: 10 },
      ],
      [
        { userId: "a", cumulativeEffort: 0 },
        { userId: "b", cumulativeEffort: 0 },
      ],
    );
    const weighted = assignChoresWithTrace(
      [
        { id: "daily", effortWeight: weightedEffort(10, "DAILY") },
        { id: "weekly", effortWeight: weightedEffort(10, "WEEKLY") },
      ],
      [
        { userId: "a", cumulativeEffort: 0 },
        { userId: "b", cumulativeEffort: 0 },
      ],
    );

    // Unweighted, the round looks perfectly level at 10 each.
    expect(unweighted.daily.roundTotals.map((t) => t.effort)).toEqual([10, 10]);
    // Weighted, the truth shows: one person is carrying seven times the other.
    expect(weighted.daily.roundTotals.map((t) => t.effort)).toEqual([280, 40]);
  });
});
