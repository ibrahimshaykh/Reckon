import { weightedEffort, type ChoreFrequency } from "@/lib/chore-weight";

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
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, 0);

  const oldest = new Date(now.getTime() - windowDays * 86_400_000);
  for (const a of assignments) {
    if (a.periodEnd < oldest) continue;
    if (!isMissed(a, now)) continue;
    counts.set(a.key, (counts.get(a.key) ?? 0) + 1);
  }

  return counts;
}
