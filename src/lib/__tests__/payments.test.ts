import { describe, it, expect } from "vitest";
import {
  applyPayments,
  applyIOUs,
  computeBalances,
  computeSettlements,
} from "@/lib/settlement";
import { deriveItemShares, toShareRatios } from "@/lib/guest-shares";

describe("applyPayments", () => {
  it("clears a debt once the money has moved", () => {
    const after = applyPayments(
      { lola: -34999, ibrahim: 34999 },
      [{ fromUserId: "lola", toUserId: "ibrahim", amountCents: 34999 }],
    );

    expect(after).toEqual({ lola: 0, ibrahim: 0 });
    expect(computeSettlements(after)).toEqual([]);
  });

  it("turns an overpayment into money owed back, rather than hiding it", () => {
    const after = applyPayments(
      { lola: -5000, ibrahim: 5000 },
      [{ fromUserId: "lola", toUserId: "ibrahim", amountCents: 7500 }],
    );

    expect(after).toEqual({ lola: 2500, ibrahim: -2500 });
    expect(
      computeSettlements(after).map(({ fromUserId, toUserId, amountCents }) => ({
        fromUserId,
        toUserId,
        amountCents,
      })),
    ).toEqual([{ fromUserId: "ibrahim", toUserId: "lola", amountCents: 2500 }]);
  });

  it("leaves the rest outstanding after a part payment", () => {
    const after = applyPayments(
      { lola: -10000, ibrahim: 10000 },
      [{ fromUserId: "lola", toUserId: "ibrahim", amountCents: 4000 }],
    );

    expect(after).toEqual({ lola: -6000, ibrahim: 6000 });
  });

  it("is the exact mirror of an IOU", () => {
    const base = { a: 0, b: 0 };
    const debt = applyIOUs(base, [{ fromUserId: "a", toUserId: "b", amountCents: 1000 }]);
    const paid = applyPayments(debt, [
      { fromUserId: "a", toUserId: "b", amountCents: 1000 },
    ]);

    expect(paid).toEqual(base);
  });

  it("adds up over several payments", () => {
    const after = applyPayments({ lola: -9000, ibrahim: 9000 }, [
      { fromUserId: "lola", toUserId: "ibrahim", amountCents: 3000 },
      { fromUserId: "lola", toUserId: "ibrahim", amountCents: 3000 },
    ]);

    expect(after).toEqual({ lola: -3000, ibrahim: 3000 });
  });
});

// The bug this whole table exists to fix, end to end.
describe("a guest paying after the group already settled", () => {
  // Coke Rs 150. Ibrahim paid; he and Lola are both in the split; sara is a
  // guest of both. Lola settles up first, then sara finally pays.
  const coke = (saraPaid: boolean) =>
    deriveItemShares({
      totalCents: 15000,
      memberIds: ["ibrahim", "lola"],
      guests: [
        {
          id: "sara",
          status: saraPaid ? "PAID" : "UNDECIDED",
          hostIds: ["ibrahim", "lola"],
        },
      ],
    });

  const balancesFor = (saraPaid: boolean, payments: Parameters<typeof applyPayments>[1]) => {
    const { memberCents, groupTotalCents } = coke(saraPaid);
    return applyPayments(
      computeBalances([
        {
          paidById: "ibrahim",
          totalCents: groupTotalCents,
          participants: Object.entries(toShareRatios(memberCents, groupTotalCents)).map(
            ([userId, shareRatio]) => ({ userId, shareRatio }),
          ),
        },
      ]),
      payments,
    );
  };

  it("bills Lola for her half of sara's share while sara hasn't paid", () => {
    const balances = balancesFor(false, []);

    expect(balances).toEqual({ ibrahim: 7500, lola: -7500 });
  });

  it("goes quiet once Lola has paid", () => {
    const balances = balancesFor(false, [
      { fromUserId: "lola", toUserId: "ibrahim", amountCents: 7500 },
    ]);

    expect(computeSettlements(balances)).toEqual([]);
  });

  // Before the payments table, this is where it went wrong: sara's money
  // reduced the group's total, the debt was re-derived from the expenses, and
  // Lola — who had already paid — was asked for Rs 50 all over again.
  it("does not bill Lola twice when sara pays late — it pays her back", () => {
    const balances = balancesFor(true, [
      { fromUserId: "lola", toUserId: "ibrahim", amountCents: 7500 },
    ]);

    const owed = computeSettlements(balances).map(
      ({ fromUserId, toUserId, amountCents }) => ({ fromUserId, toUserId, amountCents }),
    );

    // Lola paid 75 but only ever owed her own 50, so she's 25 up — and it's
    // Ibrahim holding it, because sara paid him.
    expect(owed).toEqual([
      { fromUserId: "ibrahim", toUserId: "lola", amountCents: 2500 },
    ]);
  });

  it("asks nobody for anything when sara pays before the group settles", () => {
    const balances = balancesFor(true, [
      { fromUserId: "lola", toUserId: "ibrahim", amountCents: 5000 },
    ]);

    expect(computeSettlements(balances)).toEqual([]);
  });
});
