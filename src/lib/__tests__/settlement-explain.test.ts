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
      { label: "burgers", kind: "ownShare", personName: "Lola", amountCents: -23333 },
      {
        label: "burgers",
        kind: "coveringGuest",
        personName: "Lola",
        guestName: "sara",
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
      kind: "paid",
      personName: "Ibrahim",
      amountCents: 70000,
    });
    expect(lines).toContainEqual({
      label: "burgers",
      kind: "coveringGuest",
      personName: "Ibrahim",
      guestName: "sara",
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
      { label: "burgers", kind: "ownShare", personName: "Lola", amountCents: -23333 },
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
      {
        label: "IOU",
        kind: "iouOwes",
        personName: "Lola",
        otherName: "Ibrahim",
        amountCents: -5000,
      },
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
      {
        label: "IOU",
        kind: "iouOwed",
        personName: "Ibrahim",
        otherName: "Lola",
        amountCents: 5000,
      },
    ]);
  });

  // Without these, a debt someone had already cleared simply vanished from
  // the receipt, which reads as the app forgetting they paid.
  it("shows money already handed over", () => {
    const lines = buildLedgerLines({
      userId: "lola",
      expenses: [burgers()],
      ious: [],
      payments: [{ fromUserId: "lola", toUserId: "ibrahim", amountCents: 34999 }],
      nameOf,
    });

    expect(lines).toContainEqual({
      label: "payment",
      kind: "alreadyPaid",
      personName: "Lola",
      otherName: "Ibrahim",
      amountCents: 34999,
    });
    // Owed 349.99 and paid 349.99, so the receipt lands on zero.
    expect(sumLines(lines)).toBe(0);
  });

  it("shows money already received on the other side", () => {
    const lines = buildLedgerLines({
      userId: "ibrahim",
      expenses: [],
      ious: [],
      payments: [{ fromUserId: "lola", toUserId: "ibrahim", amountCents: 34999 }],
      nameOf,
    });

    expect(lines).toEqual([
      {
        label: "payment",
        kind: "alreadyReceived",
        personName: "Ibrahim",
        otherName: "Lola",
        amountCents: -34999,
      },
    ]);
  });

  it("carries no line for a payment between two other people", () => {
    const lines = buildLedgerLines({
      userId: "sam",
      expenses: [],
      ious: [],
      payments: [{ fromUserId: "lola", toUserId: "ibrahim", amountCents: 34999 }],
      nameOf,
    });

    expect(lines).toEqual([]);
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
