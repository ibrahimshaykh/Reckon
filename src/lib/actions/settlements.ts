"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import { toCents, fromCents } from "@/lib/money";
import { computeBalances, computeSettlements, applyIOUs } from "@/lib/settlement";

// The only writer of Settlement rows. Called from the actions that actually
// change a group's balances (adding an expense, adding an IOU) — never from
// a page read, so viewing the settle page doesn't itself mutate the database.
// One row per (groupId, fromUserId, toUserId) is the DB-enforced invariant
// (see the settlement_pair_unique migration): it's upserted in place rather
// than accumulating a new row per settle cycle.
export async function recalculateSettlements(groupId: string) {
  const [expenses, ious] = await Promise.all([
    db.expense.findMany({
      where: { groupId },
      include: { items: { include: { participants: true } } },
    }),
    db.iOU.findMany({ where: { groupId } }),
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
  const computed = computeSettlements(balances);

  await Promise.all(
    computed.map(async (s) => {
      const key = {
        groupId_fromUserId_toUserId: {
          groupId,
          fromUserId: s.fromUserId,
          toUserId: s.toUserId,
        },
      };
      const existing = await db.settlement.findUnique({ where: key });

      await db.settlement.upsert({
        where: key,
        update: {
          amount: fromCents(s.amountCents),
          explanation: s.explanation,
          // A previously-settled pair with new debt starts a fresh cycle;
          // an in-flight PENDING/PAY_MARKED cycle keeps its status so this
          // doesn't clobber "already marked paid, awaiting confirmation".
          ...(existing?.status === "CONFIRMED" ? { status: "PENDING" as const } : {}),
        },
        create: {
          groupId,
          fromUserId: s.fromUserId,
          toUserId: s.toUserId,
          amount: fromCents(s.amountCents),
          explanation: s.explanation,
          status: "PENDING",
        },
      });
    }),
  );

  // Pairs no longer in the computed set are fully settled by other activity
  // (e.g. an offsetting IOU) — nothing left to track for them.
  const activePairs = new Set(computed.map((s) => `${s.fromUserId}:${s.toUserId}`));
  const existingRows = await db.settlement.findMany({ where: { groupId } });
  const staleIds = existingRows
    .filter((r) => !activePairs.has(`${r.fromUserId}:${r.toUserId}`))
    .map((r) => r.id);
  if (staleIds.length > 0) {
    await db.settlement.deleteMany({ where: { id: { in: staleIds } } });
  }
}

// Pure read — no mutation. Viewing this list must never write to the
// database; recalculateSettlements (called from the actions that change
// balances) is the only writer.
export async function getGroupSettlements(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const rows = await db.settlement.findMany({ where: { groupId } });

  const userIds = [...new Set(rows.flatMap((s) => [s.fromUserId, s.toUserId]))];
  const users = await db.user.findMany({ where: { id: { in: userIds } } });
  const nameOf = (id: string) => users.find((u) => u.id === id)?.displayName ?? id;

  return rows.map((s) => {
    const explanation = s.explanation as { steps: string[] };
    const toUser = users.find((u) => u.id === s.toUserId);
    return {
      id: s.id,
      status: s.status,
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      amountCents: toCents(s.amount),
      fromName: nameOf(s.fromUserId),
      toName: nameOf(s.toUserId),
      toVenmoHandle: toUser?.venmoHandle ?? null,
      toPaypalHandle: toUser?.paypalHandle ?? null,
      toCashappHandle: toUser?.cashappHandle ?? null,
      toEasypaisaNumber: toUser?.easypaisaNumber ?? null,
      toJazzcashNumber: toUser?.jazzcashNumber ?? null,
      toNayapayHandle: toUser?.nayapayHandle ?? null,
      toBankDetails: toUser?.bankDetails ?? null,
      explanation: {
        steps: explanation.steps.map((step) =>
          step.replace(s.fromUserId, nameOf(s.fromUserId)).replace(s.toUserId, nameOf(s.toUserId)),
        ),
      },
    };
  });
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
