// When somebody is allowed to walk away from a group.
//
// The tempting answer is "whenever they like", and it's wrong. Balances are
// derived from expenses, IOUs and payments; a person with money outstanding
// who stops being a member leaves a debt nobody can settle and a creditor
// nobody can pay. The group's books would never reconcile again.
//
// So the rule is: square up first. It's the same principle as not letting an
// expense change under a guest who's already been quoted a figure — an action
// that quietly breaks the maths isn't allowed, however convenient.

export type LeaveRefusal = "owesMoney" | "owedMoney" | "notAMember" | "alreadyLeft";

export type LeaveCheck = {
  isMember: boolean;
  alreadyLeft: boolean;
  /** Their net balance in cents: negative owes, positive is owed. */
  balanceCents: number;
};

export function refuseLeave({
  isMember,
  alreadyLeft,
  balanceCents,
}: LeaveCheck): LeaveRefusal | null {
  if (!isMember) return "notAMember";
  if (alreadyLeft) return "alreadyLeft";

  // Both directions matter. Being owed money is just as blocking as owing it:
  // walk out with Rs 400 outstanding in your favour and whoever owes it can
  // never clear their balance.
  if (balanceCents < 0) return "owesMoney";
  if (balanceCents > 0) return "owedMoney";

  return null;
}

export function canLeave(check: LeaveCheck): boolean {
  return refuseLeave(check) === null;
}
