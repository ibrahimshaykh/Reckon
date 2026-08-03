import { describe, it, expect } from "vitest";
import en from "@/dictionaries/en.json";
import ur from "@/dictionaries/ur.json";
import es from "@/dictionaries/es.json";
import { explainAssignment, loadGap } from "@/lib/chore-explanation";
import { assignChoresWithTrace } from "@/lib/chore-rotation";
import { weightedEffort } from "@/lib/chore-weight";
import type { Dictionary } from "@/lib/dictionary";

const DICTS: [string, Dictionary][] = [
  ["en", en as unknown as Dictionary],
  ["ur", ur as unknown as Dictionary],
  ["es", es as unknown as Dictionary],
];
const dict = en as unknown as Dictionary;

// The live group, at the moment the user challenged the numbers: "loooo",
// worth 7 and done daily, handed to Lola when she was on 182 a week and
// Ibrahim was on 189. Both figures are all-time totals in 28-day units.
const LOOOO = {
  choreName: "loooo",
  effortWeight: 7,
  frequency: "DAILY" as const,
  weightedEffort: weightedEffort(7, "DAILY"),
  assigneeName: "Lola Love",
  effortBefore: 728,
  loadsBefore: [
    { name: "Lola Love", effort: 728 },
    { name: "Ibrahim Ahmed", effort: 756 },
  ],
  firstRound: false,
  roundTotals: [
    { name: "Lola Love", effort: 924 },
    { name: "Ibrahim Ahmed", effort: 756 },
  ],
};

describe("explainAssignment", () => {
  it("shows what everyone had, not just the person who was picked", () => {
    const lines = explainAssignment(LOOOO, dict).join(" ");

    // "They had the least" is only checkable against the other numbers. Naming
    // one person's total and leaving the rest out is an assertion, not a
    // reason, and it read as arbitrary on the live page.
    expect(lines).toContain("Lola Love on 182 a week");
    expect(lines).toContain("Ibrahim Ahmed on 189 a week");
  });

  it("states the gap that decided it", () => {
    const lines = explainAssignment(LOOOO, dict).join(" ");

    // 189 − 182. Being told the margin is what turns "you were picked" into
    // something the other person can check.
    expect(lines).toContain("7 a week less than Ibrahim Ahmed");
  });

  it("says what those totals are counting", () => {
    const lines = explainAssignment(LOOOO, dict).join(" ");

    // The panel underneath is on the same scale now, but the totals are still
    // far bigger than any single chore, so they need explaining or they look
    // like a different unit.
    expect(lines).toContain("actually finished");
    // And they can go down, which is startling if nobody warned you.
    expect(lines).toContain("stops counting once its time is up");
  });

  it("explains a daily chore in weeks, not multipliers", () => {
    const lines = explainAssignment(LOOOO, dict).join(" ");

    expect(lines).toContain("done 7 times a week");
    expect(lines).toContain("49 a week");
    // The old wording. "0.5× a weekly chore" is arithmetic, not English.
    expect(lines).not.toContain("counts as 49 against a weekly chore");
  });

  it("describes each frequency in its own words", () => {
    const at = (frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY") =>
      explainAssignment(
        {
          ...LOOOO,
          effortWeight: 8,
          frequency,
          weightedEffort: weightedEffort(8, frequency),
        },
        dict,
      ).join(" ");

    expect(at("WEEKLY")).toContain("once a week");
    expect(at("BIWEEKLY")).toContain("once every 2 weeks");
    expect(at("BIWEEKLY")).toContain("half of 8");
    expect(at("MONTHLY")).toContain("once every 4 weeks");
    expect(at("MONTHLY")).toContain("a quarter of 8");
  });

  it("does not claim anyone had the least when everyone was level", () => {
    const lines = explainAssignment(
      {
        ...LOOOO,
        loadsBefore: [
          { name: "Lola Love", effort: 728 },
          { name: "Ibrahim Ahmed", effort: 728 },
        ],
      },
      dict,
    ).join(" ");

    // Saying "least" of a tie contradicts the numbers printed beside it, and
    // people notice when the app's reasoning disagrees with its own figures.
    expect(lines).toContain("carrying exactly the same");
    expect(lines).not.toContain("less than");
  });

  it("still explains assignments made before standings were recorded", () => {
    const { loadsBefore, ...old } = LOOOO;
    void loadsBefore;
    const lines = explainAssignment(old, dict).join(" ");

    // Falls back to the one figure it has rather than inventing a comparison
    // it can't support.
    expect(lines).toContain("carrying the least (182 a week)");
  });

  it("does not accuse anyone on an opening round", () => {
    const lines = explainAssignment({ ...LOOOO, firstRound: true }, dict).join(" ");

    expect(lines).toContain("Nobody had done anything yet");
    expect(lines).not.toContain("less than");
  });

  it("passes legacy step-based explanations straight through", () => {
    expect(explainAssignment({ steps: ["old reason"] }, dict)).toEqual(["old reason"]);
  });

  it.each(DICTS)("fills every placeholder in %s", (_lang, d) => {
    for (const frequency of ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"] as const) {
      for (const firstRound of [true, false]) {
        const lines = explainAssignment(
          {
            ...LOOOO,
            frequency,
            weightedEffort: weightedEffort(7, frequency),
            firstRound,
          },
          d,
        );
        expect(lines.join(" ")).not.toMatch(/\{[a-z]+\}/i);
      }
    }
  });
});

describe("loadGap", () => {
  it("names who is behind and by how much", () => {
    expect(
      loadGap([
        { name: "Ibrahim Ahmed", effort: 357 },
        { name: "Lola Love", effort: 371 },
      ]),
    ).toEqual({ behind: "Ibrahim Ahmed", ahead: "Lola Love", gap: 14 });
  });

  it("reports nothing when the split is exactly level", () => {
    expect(
      loadGap([
        { name: "a", effort: 100 },
        { name: "b", effort: 100 },
      ]),
    ).toBeNull();
  });

  it("has nothing to compare with a single person", () => {
    expect(loadGap([{ name: "a", effort: 5 }])).toBeNull();
  });

  it("measures the widest gap, not the closest pair", () => {
    const gap = loadGap([
      { name: "a", effort: 10 },
      { name: "b", effort: 40 },
      { name: "c", effort: 100 },
    ]);

    expect(gap).toEqual({ behind: "a", ahead: "c", gap: 90 });
  });
});

describe("the standings a chore is explained with", () => {
  it("records where everyone stood at that pick, not at the end of the round", () => {
    const trace = assignChoresWithTrace(
      [
        { id: "heavy", effortWeight: 100 },
        { id: "light", effortWeight: 10 },
      ],
      [
        { userId: "a", cumulativeEffort: 0 },
        { userId: "b", cumulativeEffort: 0 },
      ],
    );

    // Both start level, so the heavy one is dealt against 0 and 0.
    expect(trace.heavy.loadsBefore.map((l) => l.effort).sort()).toEqual([0, 0]);
    // By the time the light one is dealt, someone is carrying 100. A snapshot
    // taken by reference instead of by copy would show the final totals here
    // and make every chore quote numbers it never saw.
    expect(trace.light.loadsBefore.map((l) => l.effort).sort((x, y) => x - y)).toEqual([
      0, 100,
    ]);
  });

  it("always includes the assignee at the figure claimed for them", () => {
    const trace = assignChoresWithTrace(
      [
        { id: "one", effortWeight: 30 },
        { id: "two", effortWeight: 20 },
        { id: "three", effortWeight: 10 },
      ],
      [
        { userId: "a", cumulativeEffort: 5 },
        { userId: "b", cumulativeEffort: 40 },
      ],
    );

    for (const t of Object.values(trace)) {
      const mine = t.loadsBefore.find((l) => l.userId === t.userId);
      expect(mine?.effort).toBe(t.effortBefore);
      // And it really was the lowest — otherwise the sentence built from this
      // is false.
      expect(t.effortBefore).toBe(Math.min(...t.loadsBefore.map((l) => l.effort)));
    }
  });
});
