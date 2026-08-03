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
    expect(describeDue("2026-08-09T17:35:00.000Z", "2026-08-06", dict, UTC)).toBe(
      "due by Sun 9 Aug, 5:35 pm",
    );
  });

  it("drops the date on the day itself and keeps the hour", () => {
    // Repeating the date somebody is already looking at tells them nothing;
    // how long they have left does.
    expect(describeDue("2026-08-06T17:35:00.000Z", "2026-08-06", dict, UTC)).toBe(
      "due by 5:35 pm this day",
    );
  });

  it("still gives a deadline that has already passed", () => {
    // Being late is worth knowing; silence would read as nothing being owed.
    expect(describeDue("2026-08-01T17:35:00.000Z", "2026-08-06", dict, UTC)).toBe(
      "due by Sat 1 Aug, 5:35 pm",
    );
  });

  it("says nothing when there is no turn", () => {
    expect(describeDue(null, "2026-08-06", dict)).toBe("");
    expect(describeDue("rubbish", "2026-08-06", dict)).toBe("");
  });

  it.each(DICTS)("leaves no placeholder unfilled in %s", (_lang, d) => {
    for (const due of ["2026-08-09T17:35:00.000Z", "2026-08-06T00:00:00.000Z"]) {
      expect(describeDue(due, "2026-08-06", d, UTC)).not.toMatch(/\{[a-z]+\}/i);
    }
  });
});
