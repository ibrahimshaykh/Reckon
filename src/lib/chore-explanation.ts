import { interpolate } from "@/lib/i18n";
import { effortWord } from "@/lib/effort-text";
import { frequencyMultiplier, asPerWeek, type ChoreFrequency } from "@/lib/chore-weight";
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
    const perWeek = frequencyMultiplier(explanation.frequency);
    lines.push(
      perWeek === 1
        ? interpolate(dict.chores.whyWeekly, { effort: explanation.effortWeight })
        : interpolate(dict.chores.whyFrequency, {
            times: perWeek,
            weekly: explanation.effortWeight * perWeek,
          }),
    );
  }

  lines.push(
    interpolate(dict.chores.whyPicked, {
      name: explanation.assigneeName,
      // Newer assignments record this in 28-day units, so it has to be shown
      // on the same per-week scale as everything else or the sentence quotes a
      // number four times larger than the totals beside it. Older ones stored
      // the raw figure and are already on that scale.
      effort:
        explanation.weightedEffort !== undefined
          ? asPerWeek(explanation.effortBefore)
          : explanation.effortBefore,
    }),
  );

  // On an opening round everyone is on zero, so "had the least" is true of
  // the whole group and reads as arbitrary. Saying outright that nobody was
  // behind is what stops the first assignment feeling like an accusation.
  lines.push(
    explanation.firstRound ? dict.chores.whyFirstRound : dict.chores.whyBalance,
  );

  return lines;
}

/** Whether the round came out level, so the UI can say so plainly. */
export function isRoundEven(totals: { effort: number }[]): boolean {
  if (totals.length < 2) return true;
  const efforts = totals.map((t) => t.effort);
  return Math.max(...efforts) === Math.min(...efforts);
}
