import { interpolate } from "@/lib/i18n";
import { effortWord } from "@/lib/effort-text";
import { asPerWeek, type ChoreFrequency } from "@/lib/chore-weight";
import type { Dictionary } from "@/lib/dictionary";

// Why a particular person got a particular job.
//
// Stored per assignment because it can't be recomputed later — it depends on
// what everyone's load happened to be at that moment. `steps` is the old
// shape, kept so assignments made before this existed still explain
// themselves instead of going blank.
export type ChoreExplanation =
  | {
      choreName: string;
      effortWeight: number;
      /** Absent on assignments made before frequency was weighted. */
      frequency?: ChoreFrequency;
      weightedEffort?: number;
      assigneeName: string;
      effortBefore: number;
      /** Absent on assignments made before everyone's standing was recorded. */
      loadsBefore?: { name: string; effort: number }[];
      /** Passed over for this chore after letting the last turn lapse. */
      skippedNames?: string[];
      firstRound: boolean;
      roundTotals: { name: string; effort: number }[];
      steps?: never;
    }
  | { steps: string[] };

export function isLegacyExplanation(
  explanation: ChoreExplanation,
): explanation is { steps: string[] } {
  return "steps" in explanation && Array.isArray(explanation.steps);
}

/**
 * Which sentence explains this chore's frequency.
 *
 * One key per frequency rather than a single template with a multiplier in it.
 * "It counts as 0.5× a weekly chore" is arithmetic, not an explanation — a
 * fortnightly job needs to be described as a fortnightly job, in words.
 */
const FREQUENCY_LINE: Record<ChoreFrequency, keyof Dictionary["chores"]> = {
  DAILY: "whyDaily",
  WEEKLY: "whyWeekly",
  BIWEEKLY: "whyBiweekly",
  MONTHLY: "whyMonthly",
};

/** The reasoning, in the reader's language, one line per point. */
export function explainAssignment(
  explanation: ChoreExplanation,
  dict: Dictionary,
): string[] {
  if (isLegacyExplanation(explanation)) return explanation.steps;

  const lines = [
    interpolate(dict.chores.whyEffort, {
      chore: explanation.choreName,
      effort: explanation.effortWeight,
      band: effortWord(explanation.effortWeight, dict),
    }),
  ];

  // Says out loud why a daily chore outweighs a weekly one of the same effort.
  // Without it the numbers below look arbitrary: a "10" beating another "10"
  // is unexplainable unless you're told one of them happens seven times.
  if (explanation.frequency && explanation.weightedEffort !== undefined) {
    lines.push(
      interpolate(dict.chores[FREQUENCY_LINE[explanation.frequency]], {
        chore: explanation.choreName,
        effort: explanation.effortWeight,
        week: asPerWeek(explanation.weightedEffort),
      }),
    );
  }

  // Newer assignments record loads in 28-day units, so they have to be shown on
  // the same per-week scale as everything else or the sentence quotes a number
  // four times larger than the totals beside it. Older ones stored the raw
  // figure and are already on that scale.
  const scale = (n: number) =>
    explanation.weightedEffort !== undefined ? asPerWeek(n) : n;

  if (explanation.firstRound) {
    // On an opening round everyone is on zero, so "had the least" is true of
    // the whole group and reads as arbitrary. Saying outright that nobody was
    // behind is what stops the first assignment feeling like an accusation.
    lines.push(dict.chores.whyFirstRound);
    return lines;
  }

  // The actual argument: everyone's standing at that moment, then the rule
  // applied to it. Quoting only the winner's number asked people to take the
  // word "least" on trust — and it sat next to a different total on the same
  // card, so it read as a contradiction rather than a reason.
  // Said before the comparison below, because it changes what that comparison
  // is between: whoever was skipped may well have had the least of anybody.
  const skipped = explanation.skippedNames ?? [];
  if (skipped.length > 0) {
    lines.push(interpolate(dict.chores.whySkipped, { names: skipped.join(", ") }));
  }

  const standings = explanation.loadsBefore;
  if (standings && standings.length > 0) {
    lines.push(
      interpolate(dict.chores.whyStandings, {
        list: standings
          .map((s) =>
            interpolate(dict.chores.whyStandingsItem, {
              name: s.name,
              effort: scale(s.effort),
            }),
          )
          .join(dict.chores.whyStandingsJoin),
      }),
    );

    // Compared among whoever was actually in the running. Including somebody
    // who was passed over would have the sentence name them as the lightest
    // while the chore went to somebody else.
    const running = standings.filter((s) => !skipped.includes(s.name));
    const pool = running.length > 0 ? running : standings;
    const behind = pool.reduce((a, b) => (a.effort <= b.effort ? a : b));
    const ahead = pool.reduce((a, b) => (a.effort >= b.effort ? a : b));
    lines.push(
      ahead.effort === behind.effort
        ? // A genuine tie. Claiming someone "had the least" here would be
          // false, and people notice when the app's reason doesn't match its
          // own numbers.
          interpolate(dict.chores.whyTie, { name: explanation.assigneeName })
        : interpolate(dict.chores.whyPicked, {
            name: explanation.assigneeName,
            behind: scale(ahead.effort - behind.effort),
            other: ahead.name,
          }),
    );
  } else {
    // Assignments from before everyone's standing was recorded. Says the same
    // thing without inventing the comparison it can't prove.
    lines.push(
      interpolate(dict.chores.whyPickedLegacy, {
        name: explanation.assigneeName,
        effort: scale(explanation.effortBefore),
      }),
    );
  }

  // What those totals are counting. They're bigger than anything on screen
  // because they cover every chore ever handed out, and without saying so the
  // reader is left comparing them against a number that means something else.
  lines.push(dict.chores.whyTotals);

  return lines;
}

/** Whether the round came out level, so the UI can say so plainly. */
export function isRoundEven(totals: { effort: number }[]): boolean {
  if (totals.length < 2) return true;
  const efforts = totals.map((t) => t.effort);
  return Math.max(...efforts) === Math.min(...efforts);
}

/**
 * Who is behind and by how much, so the panel can say what happens next
 * instead of only showing numbers.
 *
 * Being told "you're 14 behind, so the next one is yours" answers the question
 * people actually have when they think the split looks wrong. A row of totals
 * on its own invites the argument rather than settling it.
 */
export function loadGap(
  totals: { name: string; effort: number }[],
): { behind: string; ahead: string; gap: number } | null {
  if (totals.length < 2) return null;
  const behind = totals.reduce((a, b) => (a.effort <= b.effort ? a : b));
  const ahead = totals.reduce((a, b) => (a.effort >= b.effort ? a : b));
  if (ahead.effort === behind.effort) return null;
  return {
    behind: behind.name,
    ahead: ahead.name,
    // Rounded because both sides are already rounded for display, and an
    // unrounded difference between two rounded numbers doesn't reconcile with
    // the figures printed right beside it.
    gap: Math.round((ahead.effort - behind.effort) * 10) / 10,
  };
}
