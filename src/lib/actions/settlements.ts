"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import { toCents, fromCents } from "@/lib/money";
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
  const computed = computeSettlements(balances);

  const persisted = await Promise.all(
    computed.map(async (s) => {
      const existing = await db.settlement.findFirst({
        where: {
          groupId,
          fromUserId: s.fromUserId,
          toUserId: s.toUserId,
          status: { not: "CONFIRMED" },
        },
      });

      const row = existing
        ? await db.settlement.update({
            where: { id: existing.id },
            data: {
              amount: fromCents(s.amountCents),
              explanation: s.explanation,
            },
          })
        : await db.settlement.create({
            data: {
              groupId,
              fromUserId: s.fromUserId,
              toUserId: s.toUserId,
              amount: fromCents(s.amountCents),
              explanation: s.explanation,
              status: "PENDING",
            },
          });

      return { ...s, id: row.id, status: row.status };
    }),
  );

  // Concurrent calls can each miss the other's fresh insert (no DB-level
  // uniqueness across non-CONFIRMED rows for a pair) and both create one —
  // clean up any leftover duplicates for the pairs this call just touched,
  // keeping the row this call landed on. Self-heals within one extra call.
  await Promise.all(
    persisted.map((s) =>
      db.settlement.deleteMany({
        where: {
          groupId,
          fromUserId: s.fromUserId,
          toUserId: s.toUserId,
          status: { not: "CONFIRMED" },
          id: { not: s.id },
        },
      }),
    ),
  );

  const userIds = [...new Set(persisted.flatMap((s) => [s.fromUserId, s.toUserId]))];
  const users = await db.user.findMany({ where: { id: { in: userIds } } });
  const nameOf = (id: string) => users.find((u) => u.id === id)?.displayName ?? id;

  return persisted.map((s) => ({
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

export async function markPaid(settlementId: string) {
  const session = await requireSession();
  const settlement = await db.settlement.findUniqueOrThrow({ where: { id: settlementId } });
  if (settlement.fromUserId !== session.id) {
    throw new ApiError(403, "Only the person who owes can mark this paid.");
  }
  await db.settlement.update({ where: { id: settlementId }, data: { status: "PAY_MARKED" } });
  revalidatePath(`/groups/${settlement.groupId}/settle`);
}

export async function confirmReceived(settlementId: string) {
  const session = await requireSession();
  const settlement = await db.settlement.findUniqueOrThrow({ where: { id: settlementId } });
  if (settlement.toUserId !== session.id) {
    throw new ApiError(403, "Only the person owed can confirm this.");
  }
  await db.settlement.update({ where: { id: settlementId }, data: { status: "CONFIRMED" } });
  revalidatePath(`/groups/${settlement.groupId}/settle`);
}
