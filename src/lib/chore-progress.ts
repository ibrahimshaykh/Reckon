import type { ChoreFrequency } from "@/lib/chore-weight";

export const FREQUENCIES: ChoreFrequency[] = [
  "DAILY",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
];

export type ProgressEntry = {
  name: string;
  /** Effort of this frequency's live turns that are finished. */
  done: number;
  /** Effort of all this frequency's live turns they hold. */
  total: number;
  percent: number;
};

export type FrequencyProgress = {
  frequency: ChoreFrequency;
  people: ProgressEntry[];
};

export type ProgressInput = {
  key: string;
  frequency: ChoreFrequency;
  effortWeight: number;
  completedAt: Date | null;
  periodStart: Date;
  periodEnd: Date;
};

/**
 * How far through the current round each person is, split by how often the
 * chores come back.
 *
 * A single running total answered "who has done more, ever", which is the
 * fairness question and not the one somebody opening the app has. They want to
 * know whether they are finished for today. Lumping a daily job in with a
 * monthly one buries that: the weekly chore you have until Sunday to do drags
 * the same bar as the bins that need taking out this evening.
 *
 * The denominator is what that person is actually holding right now, which is
 * the only honest one available. An all-time total has no ceiling to measure
 * against — it only ever grows — so "99 out of what?" has no answer until the
 * question is narrowed to a round.
 *
 * Raw effort rather than the weighted figure, because within one frequency the
 * weighting is a constant multiplier: it would scale both halves of the
 * fraction identically and only make the numbers bigger.
 */
export function periodProgress(
  assignments: ProgressInput[],
  now: Date,
  keys: string[] = [],
): FrequencyProgress[] {
  const live = assignments.filter((a) => a.periodEnd > now && a.periodStart <= now);

  return FREQUENCIES.map((frequency) => {
    const mine = live.filter((a) => a.frequency === frequency);

    const people = keys.map((name) => {
      const theirs = mine.filter((a) => a.key === name);
      const total = theirs.reduce((sum, a) => sum + a.effortWeight, 0);
      const done = theirs
        .filter((a) => a.completedAt !== null)
        .reduce((sum, a) => sum + a.effortWeight, 0);

      return {
        name,
        done,
        total,
        // Nothing to do reads as nothing done rather than as complete: an
        // empty bar is honest, a full one would congratulate somebody for a
        // round they were never given.
        percent: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    });

    return { frequency, people };
  })
    // A household with no fortnightly chores should not be shown an empty
    // fortnightly box.
    .filter((block) => block.people.some((p) => p.total > 0));
}
