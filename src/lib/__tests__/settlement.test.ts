import { describe, it, expect } from "vitest";
import {
  computeBalances,
  computeSettlements,
  applyIOUs,
  applyPayments,
  paymentsStillOwed,
} from "@/lib/settlement";

describe("computeBalances + computeSettlements", () => {
  it("3-way equal split settles to the single payer", () => {
    const balances = computeBalances([
      {
        paidById: "A",
        totalCents: 3000,
        participants: [
          { userId: "A", shareRatio: 1 / 3 },
          { userId: "B", shareRatio: 1 / 3 },
          { userId: "C", shareRatio: 1 / 3 },
        ],
      },
    ]);
    expect(balances).toEqual({ A: 2000, B: -1000, C: -1000 });

    const settlements = computeSettlements(balances).map(
      ({ fromUserId, toUserId, amountCents }) => ({ fromUserId, toUserId, amountCents }),
    );
    expect(settlements).toEqual([
      { fromUserId: "B", toUserId: "A", amountCents: 1000 },
      { fromUserId: "C", toUserId: "A", amountCents: 1000 },
    ]);
  });

  it("uneven $10/3 split gives the rounding remainder to the last participant", () => {
    const balances = computeBalances([
      {
        paidById: "A",
        totalCents: 1000,
        participants: [
          { userId: "A", shareRatio: 1 / 3 },
          { userId: "B", shareRatio: 1 / 3 },
          { userId: "C", shareRatio: 1 / 3 },
        ],
      },
    ]);
    expect(balances).toEqual({ A: 667, B: -333, C: -334 });
  });

  it("2 creditors and 2 debtors settle in exactly 2 transactions", () => {
    const balances = computeBalances([
      {
        paidById: "A",
        totalCents: 4000,
        participants: [
          { userId: "A", shareRatio: 1 / 4 },
          { userId: "B", shareRatio: 1 / 4 },
          { userId: "C", shareRatio: 1 / 4 },
          { userId: "D", shareRatio: 1 / 4 },
        ],
      },
      {
        paidById: "D",
        totalCents: 2000,
        participants: [
          { userId: "A", shareRatio: 1 / 2 },
          { userId: "B", shareRatio: 1 / 2 },
        ],
      },
    ]);
    expect(balances).toEqual({ A: 2000, B: -2000, C: -1000, D: 1000 });

    const settlements = computeSettlements(balances).map(
      ({ fromUserId, toUserId, amountCents }) => ({ fromUserId, toUserId, amountCents }),
    );
    expect(settlements).toEqual([
      { fromUserId: "B", toUserId: "A", amountCents: 2000 },
      { fromUserId: "C", toUserId: "D", amountCents: 1000 },
    ]);
  });

  it("all-zero balances produce no settlements", () => {
    expect(computeSettlements({ A: 0, B: 0 })).toEqual([]);
  });

  it("empty input produces no settlements", () => {
    expect(computeSettlements({})).toEqual([]);
  });
});

describe("applyIOUs", () => {
  it("an IOU credits the lender and debits the borrower", () => {
    const result = applyIOUs({ A: 0, B: 0 }, [
      { fromUserId: "B", toUserId: "A", amountCents: 2000 },
    ]);
    expect(result).toEqual({ A: 2000, B: -2000 });
  });

  it("stacks on top of existing expense balances", () => {
    const result = applyIOUs({ A: 1500, B: -1500 }, [
      { fromUserId: "B", toUserId: "A", amountCents: 2000 },
    ]);
    expect(result).toEqual({ A: 3500, B: -3500 });
  });
});

// Deleting an expense re-derives balances from whatever remains, so these
// pin the behaviour the delete action depends on: the removed expense must
// leave no trace in the maths.
describe("recomputing after an expense is removed", () => {
  const groceries = {
    paidById: "A",
    totalCents: 3000,
    participants: [
      { userId: "A", shareRatio: 1 / 2 },
      { userId: "B", shareRatio: 1 / 2 },
    ],
  };
  const mistake = {
    paidById: "B",
    totalCents: 9999,
    participants: [
      { userId: "A", shareRatio: 1 / 2 },
      { userId: "B", shareRatio: 1 / 2 },
    ],
  };

  it("drops the removed expense's contribution entirely", () => {
    const withMistake = computeBalances([groceries, mistake]);
    const afterDelete = computeBalances([groceries]);

    expect(withMistake).not.toEqual(afterDelete);
    expect(afterDelete).toEqual({ A: 1500, B: -1500 });
    expect(computeSettlements(afterDelete)).toEqual([
      expect.objectContaining({ fromUserId: "B", toUserId: "A", amountCents: 1500 }),
    ]);
  });

  it("leaves nobody owing anything once the only expense is removed", () => {
    expect(computeSettlements(computeBalances([]))).toEqual([]);
  });

  it("keeps an unrelated IOU intact when an expense is deleted", () => {
    const balances = applyIOUs(computeBalances([]), [
      { fromUserId: "B", toUserId: "A", amountCents: 500 },
    ]);
    expect(computeSettlements(balances)).toEqual([
      expect.objectContaining({ fromUserId: "B", toUserId: "A", amountCents: 500 }),
    ]);
  });
});

describe("paymentsStillOwed", () => {
  const day = (d: number) => new Date(`2026-08-${String(d).padStart(2, "0")}T12:00:00Z`);

  it("keeps a payment made after a bill that still exists", () => {
    // The case the payment record exists for: the bill is still on the books,
    // the money has been handed over, and asking for it again would be
    // charging twice.
    const kept = paymentsStillOwed([{ confirmedAt: day(20) }], [day(1)]);

    expect(kept).toHaveLength(1);
  });

  it("drops a payment whose bills have all been deleted", () => {
    // Every surviving bill was created after the payment, so whatever it
    // settled is gone.
    const kept = paymentsStillOwed([{ confirmedAt: day(10) }], [day(18)]);

    expect(kept).toEqual([]);
  });

  it("drops every payment when nothing is owed at all", () => {
    expect(paymentsStillOwed([{ confirmedAt: day(10) }], [])).toEqual([]);
  });

  it("keeps a payment if any surviving debt predates it, not just the newest", () => {
    const kept = paymentsStillOwed([{ confirmedAt: day(10) }], [day(2), day(28)]);

    expect(kept).toHaveLength(1);
  });

  it("stops a stale payment inventing a debt the other way round", () => {
    // The real symptom: two bills plainly totalling 2,500 owed from B to A,
    // reported as less because payments settling long-deleted bills were
    // still being applied.
    const balances = computeBalances([
      {
        paidById: "A",
        totalCents: 500_000,
        participants: [
          { userId: "A", shareRatio: 0.5 },
          { userId: "B", shareRatio: 0.5 },
        ],
      },
    ]);
    expect(balances).toEqual({ A: 250_000, B: -250_000 });

    const orphan = [{ confirmedAt: day(10), fromUserId: "B", toUserId: "A", amountCents: 20_000 }];
    const live = paymentsStillOwed(orphan, [day(18)]);

    // Applied, it would drag A down to 230,000 — the bug. Filtered out first,
    // the balance is what the surviving bill actually says.
    expect(applyPayments(balances, orphan)).toEqual({ A: 230_000, B: -230_000 });
    expect(applyPayments(balances, live)).toEqual({ A: 250_000, B: -250_000 });
  });
});
