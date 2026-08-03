import { weightedEffort, type ChoreFrequency } from "@/lib/chore-weight";
import { lastCoveredDay, toIsoDate } from "@/lib/chore-schedule";

export type LoadableAssignment = {
  /** Whoever the load belongs to — a user id or a display name, as needed. */
  key: string;
  completedAt: Date | null;
  periodEnd: Date;
  effortWeight: number;
  frequency: ChoreFrequency;
};

/**
 * Whether an assignment counts toward what someone is carrying.
 *
 * Two rules, because either one alone goes wrong:
 *
 * Counting every assignment — the old behaviour — meant being handed a job was
 * worth exactly as much as doing it. Someone could be given ten chores, do
 * none, and the rotation would read them as fully loaded and start sparing
 * them, while whoever actually cleaned the bathroom got handed the next one.
 *
 * Counting only completed work fails the other way. A chore isn't done the
 * instant it's assigned, so a person mid-period would read as empty and the
 * next few chores would all land on them — a dogpile that only clears once
 * they finish something.
 *
 * So: while the period is still running it counts, because you're on the hook
 * for it. Once the period is over it counts only if you actually did it. Miss
 * your turn and the credit goes away when the period ends, which puts you
 * behind and sends the next chore your way — you make up the work you skipped.
 */
export function countsTowardLoad(
  assignment: Pick<LoadableAssignment, "completedAt" | "periodEnd">,
  now: Date,
): boolean {
  if (assignment.periodEnd >= now) return true;
  return assignment.completedAt !== null;
}

/**
 * What everyone is carrying, in whole 28-day units.
 *
 * Shared by the rotation and by the panel that explains it. They were once two
 * separate sums and drifted apart, so the app decided using one number and
 * displayed another — a chore's stated reason could not be reconciled with the
 * totals printed beneath it. One function now, so they cannot disagree again.
 */
export function totalLoad(
  assignments: LoadableAssignment[],
  now: Date,
  keys: string[] = [],
): Map<string, number> {
  const totals = new Map<string, number>();
  // Seeded so somebody who has never been given anything still appears, on
  // zero, rather than vanishing from the comparison entirely.
  for (const key of keys) totals.set(key, 0);

  for (const a of assignments) {
    if (!countsTowardLoad(a, now)) continue;
    totals.set(
      a.key,
      (totals.get(a.key) ?? 0) + weightedEffort(a.effortWeight, a.frequency),
    );
  }

  return totals;
}

/** How far back a missed turn is still worth mentioning. */
export const MISSED_WINDOW_DAYS = 30;

/**
 * A turn whose time ran out with the work not done.
 *
 * The same condition that makes it stop counting toward someone's load, named
 * from the other side. Keeping both here means the number shown to the group
 * and the number the rotation acts on can never tell different stories.
 */
export function isMissed(
  assignment: Pick<LoadableAssignment, "completedAt" | "periodEnd">,
  now: Date,
): boolean {
  return !countsTowardLoad(assignment, now);
}

export type MissedTurn = {
  choreName: string;
  effortWeight: number;
  frequency: ChoreFrequency;
  /** The day it was due — and the day to open to put it right. */
  dueOn: string;
};

/**
 * Which turns each person let lapse, most recent first.
 *
 * The names, not just a tally. A count on its own says something went wrong
 * and gives you no way to act on it: the fix for a job you did but forgot to
 * tick is to open the day it was due and tick it, which you cannot do if
 * nothing tells you which job or which day.
 */
export function listMissed(
  assignments: (Pick<LoadableAssignment, "key" | "completedAt" | "periodEnd"> & {
    choreName: string;
    effortWeight: number;
    frequency: ChoreFrequency;
  })[],
  now: Date,
  keys: string[] = [],
  windowDays: number = MISSED_WINDOW_DAYS,
): Map<string, MissedTurn[]> {
  const found = new Map<string, MissedTurn[]>();
  for (const key of keys) found.set(key, []);

  const oldest = new Date(now.getTime() - windowDays * 86_400_000);
  const recent = assignments
    .filter((a) => a.periodEnd >= oldest && isMissed(a, now))
    // Most recent first: the one somebody is most likely to remember doing,
    // and the one still worth going back for.
    .sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime());

  for (const a of recent) {
    found.set(a.key, [
      ...(found.get(a.key) ?? []),
      {
        choreName: a.choreName,
        effortWeight: a.effortWeight,
        frequency: a.frequency,
        dueOn: toIsoDate(lastCoveredDay(a.periodEnd)),
      },
    ]);
  }

  return found;
}

/**
 * Missed turns per person, over a recent window.
 *
 * Recent rather than all-time on purpose. The point is to show a pattern
 * somebody can still do something about; a tally stretching back a year would
 * read as a permanent mark against a person rather than a description of how
 * the last few weeks have gone.
 *
 * This exists because the app was erasing the one thing a house actually
 * argues about. A missed turn dropped out of the totals overnight and the
 * name came off the row, so the person handed extra work could not see why,
 * and "you keep skipping" had nothing behind it but memory.
 */
export function countMissed(
  assignments: Pick<LoadableAssignment, "key" | "completedAt" | "periodEnd">[],
  now: Date,
  keys: string[] = [],
  windowDays: number = MISSED_WINDOW_DAYS,
): Map<string, number> {
  // Derived from the list rather than counted separately, so the number beside
  // somebody's name and the jobs behind it can never disagree.
  const listed = listMissed(
    assignments.map((a) => ({
      ...a,
      choreName: "",
      effortWeight: 0,
      frequency: "WEEKLY" as ChoreFrequency,
    })),
    now,
    keys,
    windowDays,
  );

  return new Map([...listed].map(([key, turns]) => [key, turns.length]));
}
