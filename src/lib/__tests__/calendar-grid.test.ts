import { describe, it, expect } from "vitest";
import {
  daysInMonth,
  isoOf,
  monthGrid,
  parseIso,
  shiftMonth,
  weekdayOfFirst,
} from "@/lib/calendar-grid";

describe("parseIso", () => {
  it("reads a plain calendar date", () => {
    expect(parseIso("2026-08-05")).toEqual({ y: 2026, m: 7, d: 5 });
  });

  it("refuses a day the month does not have", () => {
    // The regex accepts these; only a real month length rules them out.
    expect(parseIso("2026-04-31")).toBeNull();
    expect(parseIso("2026-02-29")).toBeNull();
  });

  it("accepts 29 February in a leap year", () => {
    expect(parseIso("2028-02-29")).toEqual({ y: 2028, m: 1, d: 29 });
  });

  it("refuses anything that isn't the input's own format", () => {
    for (const bad of ["", "2026-8-5", "05/08/2026", "2026-13-01", "2026-00-10"]) {
      expect(parseIso(bad)).toBeNull();
    }
  });
});

describe("daysInMonth", () => {
  it("knows the short months and the leap years", () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2028, 1)).toBe(29);
    expect(daysInMonth(2026, 3)).toBe(30);
    expect(daysInMonth(2026, 7)).toBe(31);
  });

  it("handles the century rule", () => {
    expect(daysInMonth(1900, 1)).toBe(28);
    expect(daysInMonth(2000, 1)).toBe(29);
  });
});

describe("shiftMonth", () => {
  it("crosses the year boundary in both directions", () => {
    expect(shiftMonth({ y: 2026, m: 11 }, 1)).toEqual({ y: 2027, m: 0 });
    expect(shiftMonth({ y: 2026, m: 0 }, -1)).toEqual({ y: 2025, m: 11 });
  });

  it("moves whole years at a time", () => {
    expect(shiftMonth({ y: 2026, m: 5 }, 12)).toEqual({ y: 2027, m: 5 });
    expect(shiftMonth({ y: 2026, m: 5 }, -18)).toEqual({ y: 2024, m: 11 });
  });
});

describe("monthGrid", () => {
  it("is always six rows of seven", () => {
    // A changing height would make the arrows jump out from under the pointer.
    for (const m of [0, 1, 4, 8, 11]) {
      expect(monthGrid({ y: 2026, m })).toHaveLength(42);
    }
    expect(monthGrid({ y: 2028, m: 1 })).toHaveLength(42);
  });

  it("starts on a Sunday", () => {
    for (const m of [0, 1, 6, 11]) {
      const first = monthGrid({ y: 2026, m })[0];
      const { y, m: mm, d } = parseIso(first.iso)!;
      expect(new Date(Date.UTC(y, mm, d)).getUTCDay()).toBe(0);
    }
  });

  it("holds exactly the month's own days, in order", () => {
    const own = monthGrid({ y: 2026, m: 7 }).filter((c) => c.inMonth);
    expect(own).toHaveLength(31);
    expect(own[0].iso).toBe("2026-08-01");
    expect(own.at(-1)!.iso).toBe("2026-08-31");
    expect(own.map((c) => c.day)).toEqual(
      Array.from({ length: 31 }, (_, i) => i + 1),
    );
  });

  it("pads from the neighbouring months, marked as not belonging", () => {
    // August 2026 opens on a Saturday, so the row before it is the end of July.
    expect(weekdayOfFirst(2026, 7)).toBe(6);
    const grid = monthGrid({ y: 2026, m: 7 });

    expect(grid.slice(0, 6).map((c) => c.iso)).toEqual([
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
    ]);
    expect(grid.slice(0, 6).every((c) => !c.inMonth)).toBe(true);
    expect(grid.at(-1)!.inMonth).toBe(false);
  });

  it("pads across a year boundary", () => {
    const grid = monthGrid({ y: 2026, m: 0 });
    expect(grid[0].iso.startsWith("2025-12")).toBe(true);

    const dec = monthGrid({ y: 2026, m: 11 });
    expect(dec.at(-1)!.iso.startsWith("2027-01")).toBe(true);
  });

  it("names every cell as a date the input would accept", () => {
    for (const cell of monthGrid({ y: 2026, m: 1 })) {
      expect(parseIso(cell.iso)).not.toBeNull();
    }
  });

  it("does not drift with the reader's clock", () => {
    // Built in UTC on purpose: a local-time Date would make the 1st read as
    // the previous day for anyone west of Greenwich.
    expect(isoOf(2026, 7, 1)).toBe("2026-08-01");
    expect(monthGrid({ y: 2026, m: 7 }).find((c) => c.inMonth)!.iso).toBe(
      "2026-08-01",
    );
  });
});
