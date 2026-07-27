import { describe, it, expect } from "vitest";
import {
  getWeekDays,
  formatDateParam,
  parseDateParam,
  splitEntryByDay,
  projectRecurringEntry,
  getEntrySegments,
  computeHourRange,
  computeBestOverlap,
  assignColors,
} from "@/lib/availability-grid";

describe("getWeekDays", () => {
  it("returns 7 consecutive local-midnight days starting from the given date", () => {
    const days = getWeekDays(new Date(2026, 6, 27, 15, 30));
    expect(days).toHaveLength(7);
    expect(days[0].getDate()).toBe(27);
    expect(days[0].getHours()).toBe(0);
    expect(days[6].getDate()).toBe(2);
  });
});

describe("formatDateParam / parseDateParam", () => {
  it("round-trips a date through the URL param format", () => {
    const date = new Date(2026, 6, 27);
    expect(formatDateParam(date)).toBe("2026-07-27");
    const parsed = parseDateParam("2026-07-27", new Date(2000, 0, 1));
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(6);
    expect(parsed.getDate()).toBe(27);
  });

  it("falls back for missing or malformed params", () => {
    const fallback = new Date(2026, 0, 1);
    expect(parseDateParam(undefined, fallback)).toBe(fallback);
    expect(parseDateParam("not-a-date", fallback)).toBe(fallback);
    expect(parseDateParam("2026/07/27", fallback)).toBe(fallback);
  });
});

describe("splitEntryByDay", () => {
  const days = getWeekDays(new Date(2026, 6, 27));

  it("keeps a same-day entry in a single segment", () => {
    const day0 = days[0].getTime();
    const segments = splitEntryByDay(
      { start: day0 + 9 * 3600_000, end: day0 + 17 * 3600_000 },
      days,
    );
    expect(segments).toEqual([{ dayIndex: 0, startMinute: 540, endMinute: 1020 }]);
  });

  it("splits an entry that spans midnight into two day segments", () => {
    const day0 = days[0].getTime();
    const segments = splitEntryByDay(
      { start: day0 + 22 * 3600_000, end: day0 + 26 * 3600_000 },
      days,
    );
    expect(segments).toEqual([
      { dayIndex: 0, startMinute: 1320, endMinute: 1440 },
      { dayIndex: 1, startMinute: 0, endMinute: 120 },
    ]);
  });

  it("drops segments entirely outside the displayed week", () => {
    const farFuture = days[6].getTime() + 10 * 24 * 3600_000;
    const segments = splitEntryByDay({ start: farFuture, end: farFuture + 3600_000 }, days);
    expect(segments).toEqual([]);
  });
});

describe("projectRecurringEntry", () => {
  // 2026-07-27 is a Monday.
  const days = getWeekDays(new Date(2026, 6, 27));

  it("projects onto every day matching the original day-of-week", () => {
    const monday = days[0].getTime();
    const original = { start: monday + 9 * 3600_000, end: monday + 11 * 3600_000 };
    const segments = projectRecurringEntry(original, days);
    expect(segments).toEqual([{ dayIndex: 0, startMinute: 540, endMinute: 660 }]);
  });

  it("projects onto next week's matching day too", () => {
    const monday = days[0].getTime();
    const original = { start: monday + 9 * 3600_000, end: monday + 11 * 3600_000 };
    const nextWeekDays = getWeekDays(new Date(2026, 7, 3));
    const segments = projectRecurringEntry(original, nextWeekDays);
    expect(segments).toEqual([{ dayIndex: 0, startMinute: 540, endMinute: 660 }]);
  });

  it("truncates a block that would cross midnight to end of day", () => {
    const monday = days[0].getTime();
    const original = { start: monday + 23 * 3600_000, end: monday + 26 * 3600_000 };
    const segments = projectRecurringEntry(original, days);
    expect(segments).toEqual([{ dayIndex: 0, startMinute: 1380, endMinute: 1440 }]);
  });
});

describe("getEntrySegments", () => {
  const days = getWeekDays(new Date(2026, 6, 27));
  const monday = days[0].getTime();

  it("dispatches to splitEntryByDay for one-time entries", () => {
    const entry = { start: monday + 9 * 3600_000, end: monday + 11 * 3600_000 };
    expect(getEntrySegments(entry, days)).toEqual(splitEntryByDay(entry, days));
  });

  it("dispatches to projectRecurringEntry for recurring entries", () => {
    const entry = { start: monday + 9 * 3600_000, end: monday + 11 * 3600_000, recurring: true };
    expect(getEntrySegments(entry, days)).toEqual(projectRecurringEntry(entry, days));
  });
});

describe("computeHourRange", () => {
  const days = getWeekDays(new Date(2026, 6, 27));

  it("defaults to 8am-10pm when there are no entries", () => {
    expect(computeHourRange([], days)).toEqual({ startHour: 8, endHour: 22 });
  });

  it("expands to fit an entry outside the default range", () => {
    const day0 = days[0].getTime();
    const entries = [{ start: day0 + 6 * 3600_000, end: day0 + 23 * 3600_000 }];
    expect(computeHourRange(entries, days)).toEqual({ startHour: 6, endHour: 23 });
  });

  it("expands to fit a recurring entry's projected time", () => {
    const day0 = days[0].getTime();
    const entries = [{ start: day0 + 5 * 3600_000, end: day0 + 7 * 3600_000, recurring: true }];
    expect(computeHourRange(entries, days)).toEqual({ startHour: 5, endHour: 22 });
  });
});

describe("computeBestOverlap", () => {
  const days = getWeekDays(new Date(2026, 6, 27));
  const monday = days[0].getTime();
  const tuesday = days[1].getTime();

  it("returns null when nobody overlaps", () => {
    const entries = [{ userId: "a", start: monday + 9 * 3600_000, end: monday + 10 * 3600_000 }];
    expect(computeBestOverlap(entries, days)).toBeNull();
  });

  it("finds the highest-attendance window", () => {
    const entries = [
      { userId: "a", start: monday + 9 * 3600_000, end: monday + 12 * 3600_000 },
      { userId: "b", start: monday + 10 * 3600_000, end: monday + 13 * 3600_000 },
      { userId: "c", start: monday + 11 * 3600_000, end: monday + 12 * 3600_000 },
    ];
    expect(computeBestOverlap(entries, days)).toEqual({
      dayIndex: 0,
      startMinute: 660,
      endMinute: 720,
      count: 3,
    });
  });

  it("breaks ties by picking the earliest day and time", () => {
    const entries = [
      { userId: "a", start: monday + 9 * 3600_000, end: monday + 11 * 3600_000 },
      { userId: "b", start: monday + 9 * 3600_000, end: monday + 11 * 3600_000 },
      { userId: "a", start: tuesday + 9 * 3600_000, end: tuesday + 11 * 3600_000 },
      { userId: "b", start: tuesday + 9 * 3600_000, end: tuesday + 11 * 3600_000 },
    ];
    expect(computeBestOverlap(entries, days)).toEqual({
      dayIndex: 0,
      startMinute: 540,
      endMinute: 660,
      count: 2,
    });
  });
});

describe("assignColors", () => {
  it("assigns a stable, distinct color per user", () => {
    const colors = assignColors(["a", "b", "c"]);
    expect(colors.a).toEqual(colors.a);
    expect(colors.a).not.toEqual(colors.b);
  });

  it("wraps around the palette for groups larger than the palette", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `user${i}`);
    const colors = assignColors(ids);
    expect(colors.user0).toEqual(colors.user8);
  });
});
