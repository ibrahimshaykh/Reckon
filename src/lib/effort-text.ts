import { interpolate } from "@/lib/i18n";
import { effortBand } from "@/lib/effort";
import type { Dictionary } from "@/lib/dictionary";

// Kept apart from the band maths so the wording can be checked against the
// real dictionaries, and so both the form and the chore list say it the
// same way rather than each formatting it their own.

export function effortWord(weight: number, dict: Dictionary): string {
  switch (effortBand(weight)) {
    case "easy":
      return dict.chores.effortEasy;
    case "moderate":
      return dict.chores.effortModerate;
    case "hard":
      return dict.chores.effortHard;
    case "veryHard":
      return dict.chores.effortVeryHard;
    case "worst":
      return dict.chores.effortWorst;
  }
}

/** "effort 10 — hard", the way it reads next to a chore. */
export function effortLabel(weight: number, dict: Dictionary): string {
  return interpolate(dict.chores.effortWithBand, {
    n: weight,
    band: effortWord(weight, dict),
  });
}

const FREQUENCY_KEY = {
  DAILY: "freqDaily",
  WEEKLY: "freqWeekly",
  BIWEEKLY: "freqBiweekly",
  MONTHLY: "freqMonthly",
} as const;

export function frequencyWord(frequency: string, dict: Dictionary): string {
  const key = FREQUENCY_KEY[frequency as keyof typeof FREQUENCY_KEY];
  return key ? dict.chores[key].toLowerCase() : frequency.toLowerCase();
}

/**
 * "kill cat (hard, weekly)" — a chore named in a way you can act on.
 *
 * Swap offers identified a chore by name alone, which is fine until a group
 * has two called the same thing. A flat can easily end up with a daily
 * "dishes" and a weekly one, and those are seven times apart in work:
 * agreeing to take "their dishes" could mean either. The weight and how often
 * it comes round are what separate them, so they travel with the name
 * anywhere somebody is being asked to commit to it.
 */
export function choreLabel(
  chore: { name: string; effortWeight: number; frequency: string },
  dict: Dictionary,
): string {
  return interpolate(dict.chores.choreWithDetail, {
    name: chore.name,
    band: effortWord(chore.effortWeight, dict),
    freq: frequencyWord(chore.frequency, dict),
  });
}
