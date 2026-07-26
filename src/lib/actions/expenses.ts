"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/dal";
import { assertMember } from "@/lib/actions/groups";
import { ApiError } from "@/lib/api-error";
import { fromCents } from "@/lib/money";
import { recalculateSettlements } from "@/lib/actions/settlements";

type AddManualExpenseInput = {
  groupId: string;
  title: string;
  totalCents: number;
  paidById: string;
  participantIds: string[];
  splitType: "EQUAL" | "CUSTOM";
  customCents?: Record<string, number>;
  source?: "MANUAL" | "RECEIPT_AI";
  receiptImageUrl?: string;
};

export async function addManualExpense(input: AddManualExpenseInput) {
  const session = await requireSession();
  await assertMember(input.groupId, session.id);

  if (!input.title.trim()) throw new ApiError(400, "Title is required.");
  if (input.totalCents <= 0) throw new ApiError(400, "Amount must be positive.");
  if (input.participantIds.length === 0) {
    throw new ApiError(400, "Pick at least one participant.");
  }

  const shares = splitToShareRatios(
    input.totalCents,
    input.participantIds,
    input.splitType,
    input.customCents,
  );

  await db.expense.create({
    data: {
      groupId: input.groupId,
      paidById: input.paidById,
      title: input.title.trim(),
      totalAmount: fromCents(input.totalCents),
      source: input.source ?? "MANUAL",
      receiptImageUrl: input.receiptImageUrl,
      items: {
        create: {
          label: input.title.trim(),
          amount: fromCents(input.totalCents),
          splitType: input.splitType,
          participants: {
            create: input.participantIds.map((userId) => ({
              userId,
              shareRatio: shares[userId],
            })),
          },
        },
      },
    },
  });

  await recalculateSettlements(input.groupId);
  revalidatePath(`/groups/${input.groupId}`);
  revalidatePath(`/groups/${input.groupId}/settle`);
}

// Ratios (not raw cents) are what's stored, since the schema's
// ExpenseItemParticipant.shareRatio is what the settlement engine reads —
// storing ratios keeps the item re-splittable if the total is ever edited.
function splitToShareRatios(
  totalCents: number,
  participantIds: string[],
  splitType: "EQUAL" | "CUSTOM",
  customCents?: Record<string, number>,
): Record<string, number> {
  if (splitType === "EQUAL") {
    const ratio = 1 / participantIds.length;
    const shares: Record<string, number> = {};
    participantIds.forEach((id) => (shares[id] = ratio));
    return shares;
  }

  if (!customCents) throw new ApiError(400, "Custom split requires amounts.");
  const sum = participantIds.reduce((s, id) => s + (customCents[id] ?? 0), 0);
  if (sum !== totalCents) {
    throw new ApiError(
      400,
      `Custom amounts (${sum} cents) must add up to the total (${totalCents} cents).`,
    );
  }
  const shares: Record<string, number> = {};
  participantIds.forEach((id) => (shares[id] = (customCents[id] ?? 0) / totalCents));
  return shares;
}

export async function listGroupExpenses(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const expenses = await db.expense.findMany({
    where: { groupId },
    include: { paidBy: true },
    orderBy: { createdAt: "desc" },
  });

  return expenses.map((e) => ({
    id: e.id,
    title: e.title,
    totalAmount: Number(e.totalAmount),
    paidByName: e.paidBy.displayName,
    createdAt: e.createdAt.toISOString(),
  }));
}
