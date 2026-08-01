// When two people are allowed to trade chores.
//
// Kept pure and apart from the database so the awkward cases — swapping with
// yourself, trading away something already done, reaching into another
// group's chores — are settled by tests rather than by hoping the UI never
// offers the option.

export type SwapSide = {
  assignmentId: string;
  userId: string;
  groupId: string;
  completedAt: Date | null;
  periodEnd: Date;
};

export type SwapRefusal =
  | "sameAssignment"
  | "samePerson"
  | "notYours"
  | "differentGroups"
  | "alreadyDone"
  | "periodOver";

/**
 * Returns why the swap can't happen, or null if it can.
 *
 * Deliberately returns a reason rather than a boolean: the caller has to tell
 * someone what went wrong, and "you can't do that" is a bad thing to read
 * when the app knows perfectly well why.
 */
export function refuseSwap({
  mine,
  theirs,
  requesterId,
  now,
}: {
  mine: SwapSide;
  theirs: SwapSide;
  requesterId: string;
  now: Date;
}): SwapRefusal | null {
  if (mine.assignmentId === theirs.assignmentId) return "sameAssignment";
  if (mine.userId !== requesterId) return "notYours";
  if (mine.userId === theirs.userId) return "samePerson";
  if (mine.groupId !== theirs.groupId) return "differentGroups";

  // Effort is credited on completion, so trading away something already done
  // would hand over credit for work that's finished — and trading for one
  // would take it. Either way the ledger stops matching who did what.
  if (mine.completedAt !== null || theirs.completedAt !== null) return "alreadyDone";

  // A turn that's already over is about to be reassigned by the next
  // rotation, so swapping it changes nothing anyone will see.
  if (mine.periodEnd < now || theirs.periodEnd < now) return "periodOver";

  return null;
}

export function canSwap(input: Parameters<typeof refuseSwap>[0]): boolean {
  return refuseSwap(input) === null;
}
