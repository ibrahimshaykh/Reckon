/**
 * The month laid out as a grid of days.
 *
 * Kept as plain year/month/day integers rather than Date objects wherever it
 * can be. A calendar cell is a date on a wall, not an instant in time, and
 * this project has already been bitten twice by treating the two as the same
 * thing — a `new Date("2026-08-05")` is midnight UTC, which is the 4th for
 * anybody west of Greenwich. Where a Date is unavoidable it is built and read
 * in UTC, so the answer cannot move with the reader's clock or with DST.
 */

export type CalendarDay = {
  /** YYYY-MM-DD, the same shape an <input type="date"> uses. */
  iso: string;
  day: number;
  /** False for the neighbouring month's days that pad the grid out. */
  inMonth: boolean;
};

/** Months are 0-based throughout, matching Date. */
export type YearMonth = { y: number; m: number };

const pad = (n: number) => String(n).padStart(2, "0");

export function isoOf(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** Null rather than a guess for anything that isn't a real calendar date. */
export function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;

  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  if (m < 0 || m > 11 || d < 1) return null;
  // Catches 31 April and 29 February in a common year, which pass the regex.
  if (d > daysInMonth(y, m)) return null;

  return { y, m, d };
}

export function daysInMonth(y: number, m: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** Weekday of the 1st, 0 = Sunday. */
export function weekdayOfFirst(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 1)).getUTCDay();
}

export function shiftMonth({ y, m }: YearMonth, delta: number): YearMonth {
  const total = y * 12 + m + delta;
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
}

/**
 * Always six rows of seven, padded from the neighbouring months.
 *
 * Fixed at 42 cells rather than however many the month needs, because a grid
 * that changes height as you page through the year makes the arrows jump out
 * from under the pointer.
 */
export function monthGrid({ y, m }: YearMonth): CalendarDay[] {
  const lead = weekdayOfFirst(y, m);
  const count = daysInMonth(y, m);
  const prev = shiftMonth({ y, m }, -1);
  const prevCount = daysInMonth(prev.y, prev.m);
  const next = shiftMonth({ y, m }, 1);

  const cells: CalendarDay[] = [];

  for (let i = lead - 1; i >= 0; i--) {
    const day = prevCount - i;
    cells.push({ iso: isoOf(prev.y, prev.m, day), day, inMonth: false });
  }
  for (let day = 1; day <= count; day++) {
    cells.push({ iso: isoOf(y, m, day), day, inMonth: true });
  }
  for (let day = 1; cells.length < 42; day++) {
    cells.push({ iso: isoOf(next.y, next.m, day), day, inMonth: false });
  }

  return cells;
}
