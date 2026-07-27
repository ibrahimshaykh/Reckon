import { describe, it, expect } from "vitest";
import {
  getWeekDays,
  splitEntryByDay,
  computeHourRange,
  assignColors,
} from "@/lib/availability-grid";

describe("getWeekDays", () => {
  it("returns 7 consecutive local-midnight days starting today for offset 0", () => {
    const now = new Date(2026, 6, 27, 15, 30);
    const days = getWeekDays(0, now);
    expect(days).toHaveLength(7);
    expect(days[0].getDate()).toBe(27);
    expect(days[0].getHours()).toBe(0);
    expect(days[6].getDate()).toBe(2);
  });

  it("shifts by 7 days per week offset", () => {
    const now = new Date(2026, 6, 27);
    const days = getWeekDays(1, now);
    expect(days[0].getDate()).toBe(3);
  });
});

describe("splitEntryByDay", () => {
  const days = getWeekDays(0, new Date(2026, 6, 27));

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

describe("computeHourRange", () => {
  const days = getWeekDays(0, new Date(2026, 6, 27));

  it("defaults to 8am-10pm when there are no entries", () => {
    expect(computeHourRange([], days)).toEqual({ startHour: 8, endHour: 22 });
  });

  it("expands to fit an entry outside the default range", () => {
    const day0 = days[0].getTime();
    const entries = [{ start: day0 + 6 * 3600_000, end: day0 + 23 * 3600_000 }];
    expect(computeHourRange(entries, days)).toEqual({ startHour: 6, endHour: 23 });
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
