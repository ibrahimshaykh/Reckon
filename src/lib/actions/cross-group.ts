"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/dal";
import { toCents } from "@/lib/money";
import { computeBalances, computeSettlements, applyIOUs } from "@/lib/settlement";

export async function getNetBalanceWithUser(otherUserId: string) {
  const session = await requireSession();

  const sharedGroups = await db.group.findMany({
    where: {
      members: { some: { userId: session.id } },
      AND: { members: { some: { userId: otherUserId } } },
    },
  });
  const groupIds = sharedGroups.map((g) => g.id);

  const otherUser = await db.user.findUniqueOrThrow({ where: { id: otherUserId } });

  // Batched across every shared group (2 queries total) rather than one
  // round trip per group — matters once a pair shares many groups.
  const [allExpenses, allIous] = await Promise.all([
    db.expense.findMany({
      where: { groupId: { in: groupIds } },
      include: { items: { include: { participants: true } } },
    }),
    db.iOU.findMany({ where: { groupId: { in: groupIds } } }),
  ]);

  const groupBreakdown = sharedGroups.map((group) => {
    const expenses = allExpenses.filter((e) => e.groupId === group.id);
    const ious = allIous.filter((i) => i.groupId === group.id);

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

    const balances = applyIOUs(
      computeBalances(flattened),
      ious.map((i) => ({
        fromUserId: i.fromUserId,
        toUserId: i.toUserId,
        amountCents: toCents(i.amount),
      })),
    );
    const settlements = computeSettlements(balances);

    const netCents = settlements.reduce((sum, s) => {
      if (s.fromUserId === otherUserId && s.toUserId === session.id) return sum + s.amountCents;
      if (s.fromUserId === session.id && s.toUserId === otherUserId) return sum - s.amountCents;
      return sum;
    }, 0);

    return { groupId: group.id, groupName: group.name, netCents };
  });

  const totalNetCents = groupBreakdown.reduce((sum, g) => sum + g.netCents, 0);

  return { otherUserName: otherUser.displayName, groupBreakdown, totalNetCents };
}
