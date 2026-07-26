"use server";

import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { toCents } from "@/lib/money";
import { computeBalances, computeSettlements } from "@/lib/settlement";

export async function getGroupSettlements(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const expenses = await db.expense.findMany({
    where: { groupId },
    include: { items: { include: { participants: true } } },
  });

  const flattened = expenses.flatMap((expense) =>
    expense.items.map((item) => ({
      paidById: expense.paidById,
      totalCents: toCents(item.amount),
      participants: item.participants.map((p) => ({
        userId: p.userId,
        shareRatio: Number(p.shareRatio),
      })),
    })),
  );

  const balances = computeBalances(flattened);
  const settlements = computeSettlements(balances);

  const userIds = [...new Set(settlements.flatMap((s) => [s.fromUserId, s.toUserId]))];
  const users = await db.user.findMany({ where: { id: { in: userIds } } });
  const nameOf = (id: string) => users.find((u) => u.id === id)?.displayName ?? id;

  return settlements.map((s) => ({
    ...s,
    fromName: nameOf(s.fromUserId),
    toName: nameOf(s.toUserId),
    explanation: {
      steps: s.explanation.steps.map((step) =>
        step.replace(s.fromUserId, nameOf(s.fromUserId)).replace(s.toUserId, nameOf(s.toUserId)),
      ),
    },
  }));
}
