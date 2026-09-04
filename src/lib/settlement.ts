export type SettlementResult = {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  explanation: {
    steps: string[];
  };
};

export type IOUInput = { fromUserId: string; toUserId: string; amountCents: number };

// An IOU is a direct debt outside any expense — "I lent Sam $20" — folded
// into the same balance sheet the expense-based settlement uses, so one
// "who owes who" list covers both.
export function applyIOUs(
  balances: Record<string, number>,
  ious: IOUInput[],
): Record<string, number> {
  const result = { ...balances };
  for (const iou of ious) {
    result[iou.fromUserId] = (result[iou.fromUserId] ?? 0) - iou.amountCents;
    result[iou.toUserId] = (result[iou.toUserId] ?? 0) + iou.amountCents;
  }
  return result;
}

export type PaymentInput = { fromUserId: string; toUserId: string; amountCents: number };

// Money that has already moved, subtracted from what the expenses say is owed.
//
// Without this, confirming a payment was only a label: the next recalculation
// re-derived the debt from the same expenses and asked for it again. Note this
// is the exact mirror of applyIOUs — an IOU is a debt created, a payment is a
// debt discharged — so it deliberately moves the balances the opposite way.
//
// Overpaying is allowed to push a balance past zero rather than being clamped.
// If someone has handed over more than they owed, the honest answer is that
// they're now owed the difference, not that they're square.
export function applyPayments(
  balances: Record<string, number>,
  payments: PaymentInput[],
): Record<string, number> {
  const result = { ...balances };
  for (const payment of payments) {
    result[payment.fromUserId] = (result[payment.fromUserId] ?? 0) + payment.amountCents;
    result[payment.toUserId] = (result[payment.toUserId] ?? 0) - payment.amountCents;
  }
  return result;
}

/**
 * The payments that still have something to settle.
 *
 * A payment records money that genuinely moved, and it has to keep counting
 * for as long as the debt it cleared exists — otherwise the same expense gets
 * charged twice, which is the bug `applyPayments` was written to prevent.
 *
 * But it must stop counting when that debt does not exist any more. Deleting
 * an expense removes it from the maths; the payment that settled it does not
 * disappear with it, and a payment with nothing left to settle does not sit
 * quietly at zero — it pushes the balance the other way and invents a debt in
 * the opposite direction. In a real group this showed up as two bills that
 * plainly totalled 2,500 being reported as 2,300, dragged by three payments
 * that had settled bills deleted weeks earlier.
 *
 * A payment settles whatever was owed at the moment it was made, so the test
 * is whether anything from before that moment survives. If every expense and
 * every IOU that predates the payment has since been deleted, it is settling
 * nothing and is left out.
 *
 * Imperfect in one direction, deliberately: a payment that cleared both a
 * surviving bill and a deleted one still counts in full, because there is no
 * record of how it was divided between them. It errs toward honouring money
 * that really moved rather than asking for it again.
 */
export function paymentsStillOwed<T extends { confirmedAt: Date }>(
  payments: T[],
  debtCreatedAt: Date[],
): T[] {
  // Nothing is owed at all, so nothing is being settled.
  if (debtCreatedAt.length === 0) return [];

  const oldest = debtCreatedAt.reduce((a, b) => (a < b ? a : b));
  return payments.filter((p) => p.confirmedAt > oldest);
}

// Greedy debt minimization: repeatedly match the largest creditor against
// the largest debtor until every balance is zero. This is the standard
// minimum-transaction heuristic — not always the mathematically fewest
// possible transfers in pathological cases, but always correct (every
// balance clears) and always explainable step by step.
export function computeSettlements(
  balances: Record<string, number>,
): SettlementResult[] {
  const entries = Object.entries(balances).filter(([, cents]) => cents !== 0);

  const creditors = entries
    .filter(([, cents]) => cents > 0)
    .map(([userId, cents]) => ({ userId, cents }))
    .sort((a, b) => b.cents - a.cents);
  const debtors = entries
    .filter(([, cents]) => cents < 0)
    .map(([userId, cents]) => ({ userId, cents: -cents }))
    .sort((a, b) => b.cents - a.cents);

  const results: SettlementResult[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.cents, debtor.cents);

    if (amount > 0) {
      results.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amountCents: amount,
        explanation: {
          steps: [
            `${debtor.userId} owes ${(debtor.cents / 100).toFixed(2)} total.`,
            `${creditor.userId} is owed ${(creditor.cents / 100).toFixed(2)} total.`,
            `Matched the largest debtor against the largest creditor for ${(amount / 100).toFixed(2)}.`,
          ],
        },
      });
    }

    creditor.cents -= amount;
    debtor.cents -= amount;
    if (creditor.cents === 0) ci++;
    if (debtor.cents === 0) di++;
  }

  return results;
}

// Net balance per user across a group's expenses: what they paid for others
// minus what they owe for their own share. Positive = owed money (creditor).
export function computeBalances(
  expenses: {
    paidById: string;
    totalCents: number;
    participants: { userId: string; shareRatio: number }[];
  }[],
): Record<string, number> {
  const balances: Record<string, number> = {};

  for (const expense of expenses) {
    balances[expense.paidById] =
      (balances[expense.paidById] ?? 0) + expense.totalCents;

    const shareCents = splitEvenlyByRatio(
      expense.totalCents,
      expense.participants,
    );
    for (const [userId, cents] of Object.entries(shareCents)) {
      balances[userId] = (balances[userId] ?? 0) - cents;
    }
  }

  return balances;
}

// Converts ratios back to exact cents, giving the leftover penny (from
// rounding) to the last participant so the sum always equals totalCents.
//
// Exported so the settle screen's breakdown is built from the same arithmetic
// that produced the balance. A second implementation would eventually drift
// and start explaining a number the app didn't actually charge.
export function splitEvenlyByRatio(
  totalCents: number,
  participants: { userId: string; shareRatio: number }[],
): Record<string, number> {
  const shares: Record<string, number> = {};
  let allocated = 0;

  participants.forEach((p, i) => {
    if (i === participants.length - 1) {
      shares[p.userId] = totalCents - allocated;
    } else {
      const cents = Math.round(totalCents * p.shareRatio);
      shares[p.userId] = cents;
      allocated += cents;
    }
  });

  return shares;
}
