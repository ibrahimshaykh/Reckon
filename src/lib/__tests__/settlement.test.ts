import { describe, it, expect } from "vitest";
import { computeBalances, computeSettlements, applyIOUs } from "@/lib/settlement";

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
