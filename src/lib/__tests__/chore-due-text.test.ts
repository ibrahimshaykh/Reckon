import { describe, it, expect } from "vitest";
import en from "@/dictionaries/en.json";
import ur from "@/dictionaries/ur.json";
import es from "@/dictionaries/es.json";
import {
  describeDue,
  formatDay,
  formatDayTime,
  formatTime,
} from "@/lib/chore-due-text";
import type { Dictionary } from "@/lib/dictionary";

const DICTS: [string, Dictionary][] = [
  ["en", en as unknown as Dictionary],
  ["ur", ur as unknown as Dictionary],
  ["es", es as unknown as Dictionary],
];
const dict = en as unknown as Dictionary;

// Pinned here only. Nothing in the app passes a zone, which is what makes the
// rendered time the reader's own — but a test that inherited the machine's
// zone would pass in Karachi and fail in London.
const UTC = "UTC";
const KARACHI = "Asia/Karachi";

describe("formatting an instant", () => {
  it("reads as a person would say it", () => {
    expect(formatDayTime("2026-08-09T17:35:00.000Z", UTC)).toBe("Sun 9 Aug, 5:35 pm");
  });

  it("gives the reader their own clock, not the server's", () => {
    // The reason times are not pinned to UTC: a turn ending at 17:35 UTC is
    // half ten at night in Karachi, and printing 5:35 pm there is just wrong.
    expect(formatTime("2026-08-09T17:35:00.000Z", KARACHI)).toBe("10:35 pm");
    expect(formatTime("2026-08-09T17:35:00.000Z", UTC)).toBe("5:35 pm");
  });

  it("carries the date across when the zone pushes it over midnight", () => {
    expect(formatDay("2026-08-09T20:30:00.000Z", KARACHI)).toBe("Mon 10 Aug");
  });

  it("says nothing rather than 'Invalid Date'", () => {
    expect(formatDay(null)).toBe("");
    expect(formatDay("not a date")).toBe("");
    expect(formatTime("not a date")).toBe("");
    expect(formatDayTime(null)).toBe("");
  });
});

describe("describeDue", () => {
  // The case the whole feature turns on: a weekly chore is live all week, so
  // it appears on every day of it. On Thursday it must not read as a Thursday
  // job when there are three days left.
  it("gives the deadline when it is not the day being viewed", () => {
    // A turn ending at midnight on the 10th is the 9th's work.
    expect(describeDue("2026-08-10T00:00:00.000Z", "2026-08-06", dict)).toBe(
      "due by the end of Sun 9 Aug",
    );
  });

  it("counts a turn ending at midnight as the day before", () => {
    // The bug this fixed: a daily turn running to midnight on the 4th showed
    // on the 4th as well as the 3rd, so a daily chore appeared twice.
    expect(describeDue("2026-08-04T00:00:00.000Z", "2026-08-03", dict)).toBe(
      "due by the end of this day",
    );
    expect(describeDue("2026-08-04T00:00:00.000Z", "2026-08-04", dict)).toBe(
      "due by the end of Mon 3 Aug",
    );
  });

  it("still gives a deadline that has already passed", () => {
    // Being late is worth knowing; silence would read as nothing being owed.
    expect(describeDue("2026-08-02T00:00:00.000Z", "2026-08-06", dict)).toBe(
      "due by the end of Sat 1 Aug",
    );
  });

  it("says nothing when there is no turn", () => {
    expect(describeDue(null, "2026-08-06", dict)).toBe("");
    expect(describeDue("rubbish", "2026-08-06", dict)).toBe("");
  });

  it("reads the same wherever the machine is", () => {
    // Deadlines are whole days now, so unlike a timestamp they must not shift
    // with the reader's zone — that would move a chore to the wrong date.
    expect(describeDue("2026-08-10T00:00:00.000Z", "2026-08-06", dict)).toContain(
      "Sun 9 Aug",
    );
  });

  it.each(DICTS)("leaves no placeholder unfilled in %s", (_lang, d) => {
    for (const due of ["2026-08-10T00:00:00.000Z", "2026-08-07T00:00:00.000Z"]) {
      expect(describeDue(due, "2026-08-06", d)).not.toMatch(/\{[a-z]+\}/i);
    }
  });
});
