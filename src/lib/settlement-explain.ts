// Why a number is what it is.
//
// The settle screen used to explain only the matching algorithm — "matched
// the largest debtor against the largest creditor" — which answers a question
// nobody asks. What people want to know is where their figure came from, and
// in particular why it's bigger than their own share: usually because they're
// carrying a guest who hasn't paid. That guest never got a mention.
//
// These lines are the receipt for a balance. They must add up to it exactly,
// which is what makes them evidence rather than commentary.

export type LedgerLine = {
  /** What this line is about — an expense title, or "IOU". */
  label: string;
  /** Why the money moved, in words. */
  detail: string;
  /** Signed: positive is owed to you, negative is owed by you. */
  amountCents: number;
};

export type ExpenseEvidence = {
  title: string;
  paidById: string;
  /**
   * What the payer is credited — the group-attributable total, which excludes
   * anything a guest already settled directly.
   */
  paidCents: number;
  /** What each member owes for it, hosting duty already folded in. */
  memberCents: Record<string, number>;
  /** Unpaid guests and who's carrying them. A paid guest has no weight left. */
  guests: { name: string; hostSplit: Record<string, number> }[];
};

export type IouEvidence = {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
};

export function buildLedgerLines({
  userId,
  expenses,
  ious,
  nameOf,
}: {
  userId: string;
  expenses: ExpenseEvidence[];
  ious: IouEvidence[];
  nameOf: (id: string) => string;
}): LedgerLine[] {
  const lines: LedgerLine[] = [];
  // Named rather than "you"/"your". These rows are read aloud to other people
  // ("look, this is why I owe you"), and a screen full of "your share" is
  // ambiguous the moment two breakdowns sit next to each other.
  const who = nameOf(userId);

  for (const expense of expenses) {
    if (expense.paidById === userId && expense.paidCents > 0) {
      lines.push({
        label: expense.title,
        detail: `${who} paid this`,
        amountCents: expense.paidCents,
      });
    }

    const owed = expense.memberCents[userId];
    if (owed === undefined) continue;

    // memberCents already includes whatever guests this person is carrying,
    // so peel that back out to show their own share separately. Lumping them
    // together is exactly what made the total look wrong.
    const carried = expense.guests.reduce(
      (sum, guest) => sum + (guest.hostSplit[userId] ?? 0),
      0,
    );
    const ownShare = owed - carried;

    if (ownShare !== 0) {
      lines.push({
        label: expense.title,
        detail: `${who}'s own share`,
        amountCents: -ownShare,
      });
    }

    for (const guest of expense.guests) {
      const carrying = guest.hostSplit[userId] ?? 0;
      if (carrying === 0) continue;
      lines.push({
        label: expense.title,
        // Spells out both sides. "covering ali" left it unclear who was doing
        // the covering once several people host the same guest.
        detail: `${who} covering for ${guest.name}, who hasn't paid yet`,
        amountCents: -carrying,
      });
    }
  }

  for (const iou of ious) {
    if (iou.fromUserId === userId) {
      lines.push({
        label: "IOU",
        detail: `${who} owes ${nameOf(iou.toUserId)}`,
        amountCents: -iou.amountCents,
      });
    } else if (iou.toUserId === userId) {
      lines.push({
        label: "IOU",
        detail: `${nameOf(iou.fromUserId)} owes ${who}`,
        amountCents: iou.amountCents,
      });
    }
  }

  return lines;
}

export function sumLines(lines: LedgerLine[]): number {
  return lines.reduce((sum, line) => sum + line.amountCents, 0);
}
