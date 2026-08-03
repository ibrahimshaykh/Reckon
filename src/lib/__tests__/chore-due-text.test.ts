import { describe, it, expect } from "vitest";
import en from "@/dictionaries/en.json";
import ur from "@/dictionaries/ur.json";
import es from "@/dictionaries/es.json";
import { describeDue, formatDay } from "@/lib/chore-due-text";
import type { Dictionary } from "@/lib/dictionary";

const DICTS: [string, Dictionary][] = [
  ["en", en as unknown as Dictionary],
  ["ur", ur as unknown as Dictionary],
  ["es", es as unknown as Dictionary],
];
const dict = en as unknown as Dictionary;

describe("formatDay", () => {
  it("reads as a person would say it", () => {
    expect(formatDay("2026-08-09T17:35:00.000Z")).toBe("Sun 9 Aug");
  });

  it("does not drift with the machine's time zone", () => {
    // Late-evening handovers are exactly where a local-time format would put
    // two flatmates on different dates for the same turn.
    expect(formatDay("2026-08-09T23:30:00.000Z")).toBe("Sun 9 Aug");
    expect(formatDay("2026-08-09T00:30:00.000Z")).toBe("Sun 9 Aug");
  });

  it("says nothing rather than 'Invalid Date'", () => {
    expect(formatDay(null)).toBe("");
    expect(formatDay("not a date")).toBe("");
  });
});

describe("describeDue", () => {
  // The case the whole feature turns on: a weekly chore is live all week, so
  // it appears on every day of it. On Thursday it must not read as a Thursday
  // job when there are three days left.
  it("gives the deadline when it is not the day being viewed", () => {
    expect(describeDue("2026-08-09T17:35:00.000Z", "2026-08-06", dict)).toBe(
      "due by Sun 9 Aug",
    );
  });

  it("says 'this day' rather than repeating the date on screen", () => {
    expect(describeDue("2026-08-06T17:35:00.000Z", "2026-08-06", dict)).toBe(
      "due by the end of this day",
    );
  });

  it("still gives a deadline that has already passed", () => {
    // Being late is worth knowing; silence would read as nothing being owed.
    expect(describeDue("2026-08-01T17:35:00.000Z", "2026-08-06", dict)).toBe(
      "due by Sat 1 Aug",
    );
  });

  it("says nothing when there is no turn", () => {
    expect(describeDue(null, "2026-08-06", dict)).toBe("");
    expect(describeDue("rubbish", "2026-08-06", dict)).toBe("");
  });

  it.each(DICTS)("leaves no placeholder unfilled in %s", (_lang, d) => {
    for (const due of ["2026-08-09T17:35:00.000Z", "2026-08-06T00:00:00.000Z"]) {
      expect(describeDue(due, "2026-08-06", d)).not.toMatch(/\{[a-z]+\}/i);
    }
  });
});
