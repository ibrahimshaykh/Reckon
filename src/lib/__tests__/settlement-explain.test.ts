import { describe, it, expect } from "vitest";
import {
  buildLedgerLines,
  sumLines,
  type ExpenseEvidence,
} from "@/lib/settlement-explain";
import { deriveItemShares } from "@/lib/guest-shares";
import { computeBalances } from "@/lib/settlement";

const nameOf = (id: string) => ({ ibrahim: "Ibrahim", lola: "Lola" })[id] ?? id;

// The real case from the app: burgers Rs 700, Ibrahim and Lola sharing, plus
// sara as a guest of both who hasn't paid. Lola's Rs 349.99 is the number
// people query, because it isn't a third of anything obvious.
function burgers(): ExpenseEvidence {
  const { memberCents, guestHostSplit } = deriveItemShares({
    totalCents: 70000,
    memberIds: ["ibrahim", "lola"],
    guests: [{ id: "sara", status: "UNDECIDED", hostIds: ["ibrahim", "lola"] }],
  });

  return {
    title: "burgers",
    paidById: "ibrahim",
    paidCents: 70000,
    memberCents,
    guests: [{ name: "sara", hostSplit: guestHostSplit.sara }],
  };
}

describe("buildLedgerLines", () => {
  it("shows the guest as a separate line, not buried in the share", () => {
    const lines = buildLedgerLines({
      userId: "lola",
      expenses: [burgers()],
      ious: [],
      nameOf,
    });

    expect(lines).toEqual([
      { label: "burgers", detail: "Lola's own share", amountCents: -23333 },
      {
        label: "burgers",
        detail: "Lola covering for sara, who hasn't paid yet",
        amountCents: -11666,
      },
    ]);
    // 233.33 + 116.66 = the 349.99 the settle screen shows.
    expect(sumLines(lines)).toBe(-34999);
  });

  it("credits the payer for what they fronted, then charges their own share", () => {
    const lines = buildLedgerLines({
      userId: "ibrahim",
      expenses: [burgers()],
      ious: [],
      nameOf,
    });

    expect(lines[0]).toEqual({
      label: "burgers",
      detail: "Ibrahim paid this",
      amountCents: 70000,
    });
    expect(lines).toContainEqual({
      label: "burgers",
      detail: "Ibrahim covering for sara, who hasn't paid yet",
      amountCents: -11667,
    });
    expect(sumLines(lines)).toBe(34999);
  });

  it("drops the guest line once they've paid their own way", () => {
    const { memberCents, guestHostSplit } = deriveItemShares({
      totalCents: 70000,
      memberIds: ["ibrahim", "lola"],
      guests: [{ id: "sara", status: "PAID", hostIds: ["ibrahim", "lola"] }],
    });

    const lines = buildLedgerLines({
      userId: "lola",
      expenses: [
        {
          title: "burgers",
          paidById: "ibrahim",
          // Sara settled her third directly, so it never reaches these books.
          paidCents: 46667,
          memberCents,
          guests: [{ name: "sara", hostSplit: guestHostSplit.sara }],
        },
      ],
      ious: [],
      nameOf,
    });

    expect(lines).toEqual([
      { label: "burgers", detail: "Lola's own share", amountCents: -23333 },
    ]);
  });

  it("names the other side of an IOU", () => {
    const lines = buildLedgerLines({
      userId: "lola",
      expenses: [],
      ious: [{ fromUserId: "lola", toUserId: "ibrahim", amountCents: 5000 }],
      nameOf,
    });

    expect(lines).toEqual([
      { label: "IOU", detail: "Lola owes Ibrahim", amountCents: -5000 },
    ]);
  });

  it("shows an IOU owed to you as money coming back", () => {
    const lines = buildLedgerLines({
      userId: "ibrahim",
      expenses: [],
      ious: [{ fromUserId: "lola", toUserId: "ibrahim", amountCents: 5000 }],
      nameOf,
    });

    expect(lines).toEqual([
      { label: "IOU", detail: "Lola owes Ibrahim", amountCents: 5000 },
    ]);
  });

  it("says nothing about an expense someone wasn't part of", () => {
    const lines = buildLedgerLines({
      userId: "stranger",
      expenses: [burgers()],
      ious: [],
      nameOf,
    });

    expect(lines).toEqual([]);
  });

  // The whole point of a breakdown is that it reconciles. A line list that
  // doesn't add up to the balance is worse than no explanation, because it
  // invites people to trust a wrong number.
  it("always adds up to the balance the settle screen shows", () => {
    for (let totalCents = 100; totalCents <= 3000; totalCents += 7) {
      const { memberCents, guestHostSplit, groupTotalCents } = deriveItemShares({
        totalCents,
        memberIds: ["ibrahim", "lola"],
        guests: [{ id: "sara", status: "UNDECIDED", hostIds: ["ibrahim", "lola"] }],
      });

      const evidence: ExpenseEvidence = {
        title: "x",
        paidById: "ibrahim",
        paidCents: groupTotalCents,
        memberCents,
        guests: [{ name: "sara", hostSplit: guestHostSplit.sara }],
      };

      const balances = computeBalances([
        {
          paidById: "ibrahim",
          totalCents: groupTotalCents,
          participants: Object.entries(memberCents).map(([userId, cents]) => ({
            userId,
            shareRatio: cents / groupTotalCents,
          })),
        },
      ]);

      for (const userId of ["ibrahim", "lola"]) {
        const lines = buildLedgerLines({ userId, expenses: [evidence], ious: [], nameOf });
        expect(sumLines(lines)).toBe(balances[userId]);
      }
    }
  });
});
