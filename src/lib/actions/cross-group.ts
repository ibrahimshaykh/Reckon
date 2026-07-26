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

  const otherUser = await db.user.findUniqueOrThrow({ where: { id: otherUserId } });

  const groupBreakdown = await Promise.all(
    sharedGroups.map(async (group) => {
      const [expenses, ious] = await Promise.all([
        db.expense.findMany({
          where: { groupId: group.id },
          include: { items: { include: { participants: true } } },
        }),
        db.iOU.findMany({ where: { groupId: group.id } }),
      ]);

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
    }),
  );

  const totalNetCents = groupBreakdown.reduce((sum, g) => sum + g.netCents, 0);

  return { otherUserName: otherUser.displayName, groupBreakdown, totalNetCents };
}
