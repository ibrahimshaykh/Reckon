// Effort weight is a bare number, and a bare number means nothing on its own.
// "Effort 10" tells you nothing unless you already know what 10 is heavy
// relative to — and since the field accepts anything from 1 to 100, there's no
// obvious ceiling to judge it against either.
//
// Naming the bands turns it into something a person can answer without being
// told the rules: you know whether scrubbing the bathroom is "hard".

export type EffortBand = "easy" | "moderate" | "hard" | "veryHard" | "worst";

// Tuned so the low numbers people actually reach for spread across the useful
// words: a cup of tea lands on "moderate", the bathroom on "hard". The upper
// bands exist because the field allows up to 100, not because anyone should
// need them.
export function effortBand(weight: number): EffortBand {
  if (weight <= 2) return "easy";
  if (weight <= 5) return "moderate";
  if (weight <= 10) return "hard";
  if (weight <= 25) return "veryHard";
  return "worst";
}
