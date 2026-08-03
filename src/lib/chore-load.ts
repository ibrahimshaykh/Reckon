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
