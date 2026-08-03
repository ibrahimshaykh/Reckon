export type ChoreFrequency = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";

// How much work a chore really is, once you account for how often it comes
// round.
//
// The rotation used to compare raw effort and nothing else, so a daily job
// worth 10 counted the same as a weekly job worth 10 — even though the daily
// one is done seven times in the same week. Whoever drew the daily chore did
// seven times the work for identical credit, and the fairness engine called
// that balanced. It could even conclude the buried person was ahead.
//
// Everything is normalised to a 28-day window, chosen because every frequency
// divides it exactly: no rounding, no drift, and these numbers get summed into
// running totals where a fraction of a unit would slowly go wrong.
const TIMES_PER_28_DAYS: Record<ChoreFrequency, number> = {
  DAILY: 28,
  WEEKLY: 4,
  BIWEEKLY: 2,
  // A month is near enough 28 days for a fairness weighting; pretending to
  // more precision than that would just reintroduce fractions.
  MONTHLY: 1,
};

/** Effort scaled by how often the chore recurs, in whole 28-day units. */
export function weightedEffort(
  effortWeight: number,
  frequency: ChoreFrequency,
): number {
  return effortWeight * TIMES_PER_28_DAYS[frequency];
}

/** How many times this chore happens in a week — the human-readable version. */
export function timesPerWeek(frequency: ChoreFrequency): number {
  return TIMES_PER_28_DAYS[frequency] / 4;
}

/**
 * How much heavier this chore is than the same effort done weekly, for
 * explaining the decision. A daily 10 is 7× a weekly 10.
 */
export function frequencyMultiplier(frequency: ChoreFrequency): number {
  return timesPerWeek(frequency);
}

/**
 * The 28-day figure converted to "effort per week", which is the scale people
 * actually see. Internally everything stays in whole 28-day units so running
 * totals can't drift; this is the one place it's turned into something
 * readable, and it matches how the explanation phrases it — a weekly 10 reads
 * as 10, a daily 10 as 70.
 */
export function asPerWeek(weighted: number): number {
  // One decimal is enough to show a monthly chore's quarter-weight without
  // printing a long float at people.
  return Math.round((weighted / 4) * 10) / 10;
}
