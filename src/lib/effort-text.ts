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
