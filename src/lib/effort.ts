// Effort weight is a bare number, and a bare number means nothing on its own.
// "Effort 10" tells you nothing unless you know what 10 is heavy relative to.
//
// Naming the bands turns it into something a person can answer without being
// told the rules: you know whether scrubbing the bathroom is "hard".

export type EffortBand = "easy" | "moderate" | "hard" | "veryHard" | "worst";

// Spread across the ten values the field actually accepts, so every word can
// be reached. They used to be stretched over 1-100: "very hard" needed an 11
// and "the worst job" a 26, neither of which anyone has ever entered, so two
// of the five words were decoration and everything from 6 to 10 read the same.
//
// The top word is kept for a true 10. An extreme label that a person can reach
// by rating something 26 — or worse, by rating half their chores 10 — stops
// meaning anything.
export function effortBand(weight: number): EffortBand {
  if (weight <= 2) return "easy";
  if (weight <= 4) return "moderate";
  if (weight <= 7) return "hard";
  if (weight <= 9) return "veryHard";
  return "worst";
}
