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

export function startOfUtcDay(at: Date): Date {
  return new Date(`${at.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/**
 * When a turn handed out at this moment should end.
 *
 * Ends land on a day boundary, so a turn covers a whole number of calendar
 * days. Running for exactly N×24 hours from whenever somebody pressed Rotate
 * meant a daily chore started at 21:04 and finished at 21:04 the next evening
 * — genuinely live across two dates, so it appeared on both, and a "daily"
 * chore showing up two days running reads as the app double-counting it.
 *
 * The deadline it produces is midnight, which is also why the row says "by the
 * end of Monday" rather than quoting a time: 21:04 was never a deadline anyone
 * chose, just the moment a button happened to be pressed.
 */
export function periodEndFor(startedAt: Date, frequency: ChoreFrequency): Date {
  return new Date(
    startOfUtcDay(startedAt).getTime() + periodLengthDays(frequency) * DAY_MS,
  );
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

export type Period = { start: Date; end: Date };
export type DayWindow = { start: Date; end: Date };

/**
 * The span a picked calendar date covers.
 *
 * Read as UTC on purpose. The date arrives as "2026-08-06" in the URL and is
 * resolved on the server, so anchoring it to the viewer's clock would make the
 * same link mean different days for two people in one flat, and would risk the
 * server and the browser disagreeing about what to render.
 */
export function dayWindow(isoDate: string): DayWindow | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const start = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** Today, in the form the date input and the URL both use. */
export function toIsoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Whether a turn is live at any point during a day.
 *
 * Overlap, not "contains midday". A turn runs from whenever the rotation ran,
 * not from midnight, so a daily chore handed out at 17:35 covers the end of
 * one date and the start of the next. It is genuinely outstanding on both, and
 * hiding it on one of them would mean somebody's list quietly missed a job
 * they still owed.
 */
export function overlapsDay(period: Period, day: DayWindow): boolean {
  return period.start < day.end && period.end > day.start;
}

/**
 * Where a chore's turns land after the last one on record.
 *
 * Turns are only created when somebody presses Rotate, so looking at any date
 * beyond the current turn would otherwise show an empty page — the daily
 * chores would simply vanish while the monthly ones stayed, which reads as the
 * app losing them. This projects the rhythm forward so a future date can say
 * what will fall due, clearly marked as nobody's yet.
 */
export function projectPeriod(
  anchorEnd: Date,
  frequency: ChoreFrequency,
  day: DayWindow,
): Period | null {
  // The day finishes before the rhythm resumes, so nothing is projected into
  // it — that stretch is history and only real turns should speak for it.
  if (day.end <= anchorEnd) return null;

  const length = periodLengthDays(frequency) * DAY_MS;
  const elapsed = day.start.getTime() - anchorEnd.getTime();
  const steps = Math.max(0, Math.floor(elapsed / length));
  const start = anchorEnd.getTime() + steps * length;

  return { start: new Date(start), end: new Date(start + length) };
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
  const period = projectPeriod(lastEnd ?? chore.createdAt, chore.frequency, day);
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
