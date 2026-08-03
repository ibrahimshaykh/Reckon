import { describe, it, expect } from "vitest";
import en from "@/dictionaries/en.json";
import ur from "@/dictionaries/ur.json";
import es from "@/dictionaries/es.json";
import { choreLabel, frequencyWord } from "@/lib/effort-text";
import type { Dictionary } from "@/lib/dictionary";

const DICTS: [string, Dictionary][] = [
  ["en", en as unknown as Dictionary],
  ["ur", ur as unknown as Dictionary],
  ["es", es as unknown as Dictionary],
];
const dict = en as unknown as Dictionary;

describe("choreLabel", () => {
  it("names a chore with what it costs and how often", () => {
    expect(
      choreLabel({ name: "kill cat", effortWeight: 10, frequency: "WEEKLY" }, dict),
    ).toBe("kill cat (hard, weekly)");
  });

  // The case that made this necessary: one group, three chores called
  // "kill cat". A swap offer naming only the chore could mean any of them, and
  // the daily one is seven times the work of the weekly one.
  it("separates two chores that share a name", () => {
    const weekly = choreLabel(
      { name: "kill cat", effortWeight: 10, frequency: "WEEKLY" },
      dict,
    );
    const daily = choreLabel(
      { name: "kill cat", effortWeight: 10, frequency: "DAILY" },
      dict,
    );

    expect(weekly).not.toBe(daily);
  });

  it("separates two chores that share a name and a frequency", () => {
    const easy = choreLabel({ name: "dishes", effortWeight: 1, frequency: "DAILY" }, dict);
    const hard = choreLabel({ name: "dishes", effortWeight: 10, frequency: "DAILY" }, dict);

    expect(easy).not.toBe(hard);
  });

  it("keeps the chore's own name first, so it stays scannable", () => {
    expect(
      choreLabel({ name: "dishes", effortWeight: 4, frequency: "DAILY" }, dict),
    ).toMatch(/^dishes/);
  });

  it("reads every frequency out of the dictionary", () => {
    // Checked against a non-English dictionary on purpose: in English the
    // translation happens to equal the lowercased enum, so the same assertion
    // there would pass even if the lookup were skipped entirely.
    const [, urdu] = DICTS[1];
    for (const f of ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]) {
      expect(frequencyWord(f, urdu)).not.toBe(f.toLowerCase());
    }
  });

  it("falls back to the raw value rather than blanking on an unknown frequency", () => {
    // A label that silently loses a word is worse than one that looks odd.
    expect(frequencyWord("HOURLY", dict)).toBe("hourly");
  });

  it.each(DICTS)("leaves no placeholder unfilled in %s", (_lang, d) => {
    for (const frequency of ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]) {
      for (const effortWeight of [1, 5, 10, 50, 100]) {
        const label = choreLabel({ name: "x", effortWeight, frequency }, d);
        expect(label).not.toMatch(/\{[a-z]+\}/i);
        expect(label).toContain("x");
      }
    }
  });
});
