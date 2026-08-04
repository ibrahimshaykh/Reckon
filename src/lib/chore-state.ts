import { lastCoveredDay, toIsoDate } from "@/lib/chore-schedule";

/**
 * What state a chore row is in, for the eye rather than the reader.
 *
 * Every row on the page looked identical — a chore due today, one due next
 * week, one already finished and one nobody holds all rendered as the same
 * grey text — so finding "what do I have to do today" meant reading every
 * line. This is the one fact the styling keys off.
 */
export type ChoreState = "done" | "unassigned" | "overdue" | "today" | "later";

export function choreState(
  chore: {
    completedAt: string | null;
    isAssigned: boolean;
    dueBy: string | null;
  },
  today: string,
  timeZone: string,
): ChoreState {
  if (chore.completedAt) return "done";
  if (!chore.isAssigned) return "unassigned";
  if (!chore.dueBy) return "later";

  // The end is exclusive, so a turn finishing at midnight belongs to the day
  // before it — the same rule the deadline text uses. Reading it any other way
  // would colour a row red on the morning it is actually still due.
  const due = toIsoDate(lastCoveredDay(chore.dueBy), timeZone);

  if (due < today) return "overdue";
  if (due === today) return "today";
  return "later";
}

/**
 * How loudly each state should be drawn.
 *
 * Ordered on purpose: most rows on a healthy page are "later", and if the
 * quiet majority is styled as loudly as the exception then nothing stands out
 * and the colour has bought nothing.
 *
 * No state is signalled by colour alone. Red, amber and green are exactly the
 * three a colour-blind reader is likeliest to confuse, so each also differs in
 * stripe weight and in the words on the row.
 */
export const STATE_TONE: Record<ChoreState, string> = {
  overdue: "var(--negative)",
  today: "var(--feature-chores)",
  done: "var(--positive)",
  later: "var(--rule)",
  unassigned: "var(--border)",
};
