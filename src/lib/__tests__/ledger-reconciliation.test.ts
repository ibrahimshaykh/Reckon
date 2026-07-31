import { describe, it, expect } from "vitest";
import {
  applyIOUs,
  applyPayments,
  computeBalances,
  computeSettlements,
} from "@/lib/settlement";
import { deriveItemShares, toShareRatios } from "@/lib/guest-shares";
import { buildLedgerLines, sumLines, type ExpenseEvidence } from "@/lib/settlement-explain";

// The four things that move a balance — a split expense, a guest somebody is
// covering, an IOU, and money already handed over — all at once.
//
// Each was checked on its own, but the breakdown had never been reconciled
// against a balance with an IOU in it. A sign error there would have gone
// unnoticed: the settle total would still be right, and only the explanation
// would disagree with it, which is the worst way to be wrong about money.

const NAMES: Record<string, string> = {
  ibrahim: "Ibrahim",
  lola: "Lola",
  sam: "Sam",
};
const nameOf = (id: string) => NAMES[id] ?? id;
const MEMBERS = ["ibrahim", "lola", "sam"];

type Scenario = {
  ious: { fromUserId: string; toUserId: string; amountCents: number }[];
  payments: { fromUserId: string; toUserId: string; amountCents: number }[];
};

function run({ ious, payments }: Scenario) {
  const { memberCents, guestHostSplit, groupTotalCents } = deriveItemShares({
    totalCents: 90000,
    memberIds: MEMBERS,
    guests: [
      { id: "sara", status: "UNDECIDED", hostIds: ["ibrahim", "lola"] },
      { id: "ali", status: "PAID", hostIds: ["sam"] },
      { id: "zara", status: "DECLINED", hostIds: ["sam", "ibrahim"] },
    ],
  });

  const evidence: ExpenseEvidence = {
    title: "the big dinner",
    paidById: "ibrahim",
    paidCents: groupTotalCents,
    memberCents,
    // A guest who paid carries nothing, matching what loadGroupLedger passes.
    guests: [
      { name: "sara", hostSplit: guestHostSplit.sara },
      { name: "zara", hostSplit: guestHostSplit.zara },
    ],
  };

  const balances = applyPayments(
    applyIOUs(
      computeBalances([
        {
          paidById: "ibrahim",
          totalCents: groupTotalCents,
          participants: Object.entries(toShareRatios(memberCents, groupTotalCents)).map(
            ([userId, shareRatio]) => ({ userId, shareRatio }),
          ),
        },
      ]),
      ious,
    ),
    payments,
  );

  return { balances, evidence };
}

const SCENARIOS: [string, Scenario][] = [
  ["no ious, no payments", { ious: [], payments: [] }],
  [
    "one iou",
    { ious: [{ fromUserId: "lola", toUserId: "sam", amountCents: 4500 }], payments: [] },
  ],
  [
    "ious in both directions",
    {
      ious: [
        { fromUserId: "lola", toUserId: "sam", amountCents: 4500 },
        { fromUserId: "sam", toUserId: "ibrahim", amountCents: 2000 },
        { fromUserId: "ibrahim", toUserId: "lola", amountCents: 999 },
      ],
      payments: [],
    },
  ],
  [
    "an iou and a payment",
    {
      ious: [{ fromUserId: "lola", toUserId: "sam", amountCents: 4500 }],
      payments: [{ fromUserId: "lola", toUserId: "ibrahim", amountCents: 12000 }],
    },
  ],
  [
    "an overpayment on top of ious",
    {
      ious: [{ fromUserId: "sam", toUserId: "ibrahim", amountCents: 3000 }],
      payments: [{ fromUserId: "sam", toUserId: "ibrahim", amountCents: 99000 }],
    },
  ],
];

describe.each(SCENARIOS)("breakdown reconciles: %s", (_label, scenario) => {
  it("every person's lines add up to their balance", () => {
    const { balances, evidence } = run(scenario);

    for (const userId of MEMBERS) {
      const lines = buildLedgerLines({
        userId,
        expenses: [evidence],
        ious: scenario.ious,
        payments: scenario.payments,
        nameOf,
      });

      expect(sumLines(lines), `${userId} lines must equal their balance`).toBe(
        balances[userId] ?? 0,
      );
    }
  });

  it("what everyone owes cancels out with what everyone is owed", () => {
    const { balances } = run(scenario);
    const total = Object.values(balances).reduce((a, b) => a + b, 0);

    // A guest who paid settled outside the group, so the books balance among
    // the members alone.
    expect(total).toBe(0);
  });

  it("settling clears every balance to zero", () => {
    const { balances } = run(scenario);
    const cleared = { ...balances };

    for (const s of computeSettlements(balances)) {
      cleared[s.fromUserId] += s.amountCents;
      cleared[s.toUserId] -= s.amountCents;
    }

    for (const remaining of Object.values(cleared)) {
      expect(remaining).toBe(0);
    }
  });
});

describe("an IOU on its own", () => {
  it("shows on both sides with opposite signs, and nets to nothing", () => {
    const iou = { fromUserId: "lola", toUserId: "sam", amountCents: 4500 };

    const lolaTotal = sumLines(
      buildLedgerLines({ userId: "lola", expenses: [], ious: [iou], nameOf }),
    );
    const samTotal = sumLines(
      buildLedgerLines({ userId: "sam", expenses: [], ious: [iou], nameOf }),
    );

    expect(lolaTotal).toBe(-4500);
    expect(samTotal).toBe(4500);
    expect(lolaTotal + samTotal).toBe(0);
  });

  it("matches what applyIOUs does to the balances", () => {
    const iou = { fromUserId: "lola", toUserId: "sam", amountCents: 4500 };
    const balances = applyIOUs({ lola: 0, sam: 0 }, [iou]);

    for (const userId of ["lola", "sam"]) {
      const lines = buildLedgerLines({ userId, expenses: [], ious: [iou], nameOf });
      expect(sumLines(lines)).toBe(balances[userId]);
    }
  });

  it("is forgotten once it's been paid off", () => {
    const iou = { fromUserId: "lola", toUserId: "sam", amountCents: 4500 };
    const payment = { fromUserId: "lola", toUserId: "sam", amountCents: 4500 };

    const balances = applyPayments(applyIOUs({ lola: 0, sam: 0 }, [iou]), [payment]);

    expect(balances).toEqual({ lola: 0, sam: 0 });
    expect(computeSettlements(balances)).toEqual([]);

    // And the receipt still explains itself: owed 45, paid 45, net zero.
    const lines = buildLedgerLines({
      userId: "lola",
      expenses: [],
      ious: [iou],
      payments: [payment],
      nameOf,
    });
    expect(lines).toHaveLength(2);
    expect(sumLines(lines)).toBe(0);
  });
});
