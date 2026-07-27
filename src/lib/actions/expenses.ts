"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/dal";
import { assertMember } from "@/lib/actions/groups";
import { ApiError } from "@/lib/api-error";
import { fromCents } from "@/lib/money";
import { validate, cuid, positiveCents, shortText } from "@/lib/validation";
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

const addManualExpenseSchema = z.object({
  groupId: cuid,
  title: shortText("Title", 150),
  totalCents: positiveCents,
  paidById: cuid,
  participantIds: z.array(cuid).min(1, "Pick at least one participant."),
  splitType: z.enum(["EQUAL", "CUSTOM"]),
  customCents: z.record(z.string(), z.number().int()).optional(),
  source: z.enum(["MANUAL", "RECEIPT_AI"]).optional(),
  receiptImageUrl: z.string().url().optional(),
});

export async function addManualExpense(input: AddManualExpenseInput) {
  const session = await requireSession();
  const valid = validate(addManualExpenseSchema, input);
  await assertMember(valid.groupId, session.id);

  const shares = splitToShareRatios(
    valid.totalCents,
    valid.participantIds,
    valid.splitType,
    valid.customCents,
  );

  await db.expense.create({
    data: {
      groupId: valid.groupId,
      paidById: valid.paidById,
      title: valid.title,
      totalAmount: fromCents(valid.totalCents),
      source: valid.source ?? "MANUAL",
      receiptImageUrl: valid.receiptImageUrl,
      items: {
        create: {
          label: valid.title,
          amount: fromCents(valid.totalCents),
          splitType: valid.splitType,
          participants: {
            create: valid.participantIds.map((userId) => ({
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

const addItemizedExpenseSchema = z.object({
  groupId: cuid,
  title: shortText("Title", 150),
  paidById: cuid,
  receiptImageUrl: z.string().url().optional(),
  items: z
    .array(
      z.object({
        label: shortText("Item label", 150),
        amountCents: positiveCents,
        // Splitwise's own rule: refuse to save if a line item's shares
        // don't add up to the whole item — catches a claim-assignment bug
        // before it corrupts a shared ledger.
        shares: z.record(z.string(), z.number()).refine(
          (shares) =>
            Object.keys(shares).length > 0 &&
            Math.abs(Object.values(shares).reduce((a, b) => a + b, 0) - 1) < 0.001,
          { message: "Each item's shares must add up to the whole item." },
        ),
      }),
    )
    .min(1, "Add at least one item."),
});

// Used by the receipt-scan flow once items have been claimed per-person —
// unlike addManualExpense, each item gets its own participant list instead
// of one flat split across the whole expense.
export async function addItemizedExpense(input: {
  groupId: string;
  title: string;
  paidById: string;
  receiptImageUrl?: string;
  items: { label: string; amountCents: number; shares: Record<string, number> }[];
}) {
  const session = await requireSession();
  const valid = validate(addItemizedExpenseSchema, input);
  await assertMember(valid.groupId, session.id);

  const totalCents = valid.items.reduce((sum, item) => sum + item.amountCents, 0);

  await db.expense.create({
    data: {
      groupId: valid.groupId,
      paidById: valid.paidById,
      title: valid.title,
      totalAmount: fromCents(totalCents),
      source: "RECEIPT_AI",
      receiptImageUrl: valid.receiptImageUrl,
      items: {
        create: valid.items.map((item) => ({
          label: item.label,
          amount: fromCents(item.amountCents),
          splitType: "CUSTOM",
          participants: {
            create: Object.entries(item.shares).map(([userId, shareRatio]) => ({
              userId,
              shareRatio,
            })),
          },
        })),
      },
    },
  });

  await recalculateSettlements(valid.groupId);
  revalidatePath(`/groups/${valid.groupId}`);
  revalidatePath(`/groups/${valid.groupId}/settle`);
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
