import type { ChoreFrequency } from "@/lib/chore-weight";

const DAY_MS = 86_400_000;

/** How long one turn at a chore lasts. */
export function periodLengthDays(frequency: ChoreFrequency): number {
  switch (frequency) {
    case "DAILY":
      return 1;
    case "WEEKLY":
      return 7;
    case "BIWEEKLY":
      return 14;
    case "MONTHLY":
      return 30;
  }
}

/**
 * How far ahead of UTC a zone is at a given instant, in milliseconds.
 *
 * Read from Intl rather than stored, so daylight saving is handled by the
 * platform's own tz database instead of a number somebody has to remember to
 * update twice a year.
 */
function zoneOffset(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Midnight comes back as hour 24 in some locales' formatting.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );

  return asIfUtc - at.getTime();
}

/** The calendar date it is, where the group lives. */
export function toIsoDate(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which is the shape the URL and the date input
  // both use.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * The instant a given local date begins.
 *
 * Returns an invalid date for a date that does not exist rather than throwing:
 * this is reached from the URL, where "2026-13-45" gets past a shape check but
 * has no midnight to find, and a page should not fall over on a typo.
 */
export function startOfDay(isoDate: string, timeZone: string): Date {
  const midnightUtc = new Date(`${isoDate}T00:00:00.000Z`).getTime();
  if (Number.isNaN(midnightUtc)) return new Date(NaN);
  // Shift by the offset, then re-read it: on the night a zone changes, the
  // offset at midnight is not always the offset the first guess landed on.
  const first = new Date(midnightUtc - zoneOffset(new Date(midnightUtc), timeZone));
  const settled = new Date(midnightUtc - zoneOffset(first, timeZone));
  return settled;
}

/** The date this many days after the given one, as a plain calendar date. */
function addDays(isoDate: string, days: number): string {
  const shifted = new Date(`${isoDate}T00:00:00.000Z`).getTime() + days * DAY_MS;
  return new Date(shifted).toISOString().slice(0, 10);
}

export type Period = { start: Date; end: Date };
export type DayWindow = { start: Date; end: Date };

/**
 * The span a picked calendar date covers, where the group lives.
 *
 * Local rather than UTC. A chore is a local-day thing — "the bins go out
 * today" means the household's today — and running on UTC meant a group five
 * hours ahead saw yesterday's list until five in the morning.
 */
export function dayWindow(isoDate: string, timeZone: string): DayWindow | null {
  // Shape first, then reality: "2026-13-45" is the right shape and no date at
  // all, and it arrives from the URL where anyone can type anything.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const start = startOfDay(isoDate, timeZone);
  if (Number.isNaN(start.getTime())) return null;

  const end = startOfDay(addDays(isoDate, 1), timeZone);
  if (Number.isNaN(end.getTime())) return null;
  return { start, end };
}

/**
 * When a turn handed out at this moment should end.
 *
 * Ends land on a local day boundary, so a turn covers a whole number of the
 * group's own calendar days. Running for exactly N×24 hours from whenever
 * somebody pressed Rotate meant a daily chore started at 21:04 and finished at
 * 21:04 the next evening — live across two dates, so it appeared on both.
 *
 * Built by adding days to the date rather than milliseconds to the instant, so
 * a turn spanning a clock change still ends at midnight rather than an hour
 * either side of it.
 */
export function periodEndFor(
  startedAt: Date,
  frequency: ChoreFrequency,
  timeZone: string,
): Date {
  const startedOn = toIsoDate(startedAt, timeZone);
  return startOfDay(addDays(startedOn, periodLengthDays(frequency)), timeZone);
}

/**
 * The last day a turn covers.
 *
 * Ends are exclusive — a turn finishing at midnight on the 4th is the 3rd's
 * work — so the date a person should be told is the instant just before.
 */
export function lastCoveredDay(periodEnd: string | Date): Date {
  const end = typeof periodEnd === "string" ? new Date(periodEnd) : periodEnd;
  return new Date(end.getTime() - 1);
}

/**
 * Whether a turn is live at any point during a day.
 *
 * Overlap, not "contains midday". A turn runs from whenever the rotation ran,
 * not from midnight, so it can begin part-way through its first date.
 */
export function overlapsDay(period: Period, day: DayWindow): boolean {
  return period.start < day.end && period.end > day.start;
}

/**
 * Where a chore's turns land after the last one on record.
 *
 * Turns are only created when the rotation runs, so looking at any date beyond
 * the current turn would otherwise show an empty page — the daily chores would
 * simply vanish while the monthly ones stayed, which reads as the app losing
 * them. This carries the rhythm forward so a future date can say what will
 * fall due, clearly marked as nobody's yet.
 */
export function projectPeriod(
  anchorEnd: Date,
  frequency: ChoreFrequency,
  day: DayWindow,
  timeZone: string,
): Period | null {
  // The day finishes before the rhythm resumes, so nothing is projected into
  // it — that stretch is history and only real turns should speak for it.
  if (day.end <= anchorEnd) return null;

  // Laid out on whole local days, like the turns the rotation creates.
  // Stepping in raw 24-hour blocks from the anchor instead meant a chore added
  // at lunchtime projected a turn running to lunchtime tomorrow.
  const length = periodLengthDays(frequency);
  const gridStart = toIsoDate(anchorEnd, timeZone);
  const grid = startOfDay(gridStart, timeZone).getTime();
  const steps = Math.max(
    0,
    Math.floor((day.start.getTime() - grid) / (length * DAY_MS)),
  );

  const start = addDays(gridStart, steps * length);
  return {
    start: startOfDay(start, timeZone),
    end: startOfDay(addDays(start, length), timeZone),
  };
}

export type Occurrence<T> = {
  period: Period;
  /** Null when the turn is projected — real, but not handed out yet. */
  assignment: T | null;
};

/**
 * What a chore looks like on a given day: whose turn it is, and by when.
 *
 * A real turn always wins over a projected one, so history reads as it
 * happened rather than as the rhythm would have predicted.
 */
export function occurrenceOn<T extends { periodStart: Date; periodEnd: Date }>(
  chore: { frequency: ChoreFrequency; createdAt: Date },
  assignments: T[],
  day: DayWindow,
  timeZone: string,
): Occurrence<T> | null {
  const live = assignments.find((a) =>
    overlapsDay({ start: a.periodStart, end: a.periodEnd }, day),
  );
  if (live) {
    return { period: { start: live.periodStart, end: live.periodEnd }, assignment: live };
  }

  // Nothing on record covers the day, so carry the rhythm on from wherever it
  // last reached — or from the chore's own beginning if it has never run.
  const lastEnd = assignments.reduce<Date | null>(
    (latest, a) => (latest === null || a.periodEnd > latest ? a.periodEnd : latest),
    null,
  );
  const period = projectPeriod(
    lastEnd ?? chore.createdAt,
    chore.frequency,
    day,
    timeZone,
  );
  return period ? { period, assignment: null } : null;
}

/**
 * Why "mark done" is unavailable, if it is.
 *
 * Only a turn that hasn't begun is refused. Blocking until the deadline
 * arrives — the obvious reading of "you can't do it yet" — would stop somebody
 * doing their weekly chore on Tuesday because it isn't due until Sunday, which
 * punishes exactly the behaviour the app wants. What can't be done is claiming
 * credit for a turn nobody has started.
 */
export function markDoneBlock(
  assignment: { periodStart: Date; completedAt: Date | null } | null,
  now: Date,
): "unassigned" | "notStarted" | "alreadyDone" | null {
  if (!assignment) return "unassigned";
  if (assignment.completedAt) return "alreadyDone";
  if (assignment.periodStart > now) return "notStarted";
  return null;
}
