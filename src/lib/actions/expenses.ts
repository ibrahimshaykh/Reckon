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
import { asActionResult, type ActionResult } from "@/lib/action-result";

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

export async function addManualExpense(input: AddManualExpenseInput): Promise<ActionResult<void>> {
  return asActionResult(async () => {
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
  });
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
}): Promise<ActionResult<void>> {
  return asActionResult(async () => {
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
  });
}

// Loads an expense for editing, and reports whether its amounts are safe to
// change. A receipt-scanned expense has one item per line on the receipt with
// its own claimed shares; rewriting that as a single equal split would throw
// away who actually had what. So those stay title/payer-only.
export async function getExpenseForEdit(expenseId: string): Promise<
  ActionResult<{
    id: string;
    groupId: string;
    title: string;
    totalCents: number;
    paidById: string;
    participantIds: string[];
    itemised: boolean;
  }>
> {
  return asActionResult(async () => {
    const session = await requireSession();
    const validId = validate(cuid, expenseId);

    const expense = await db.expense.findUniqueOrThrow({
      where: { id: validId },
      include: { items: { include: { participants: true } } },
    });

    await assertMember(expense.groupId, session.id);
    if (expense.paidById !== session.id) {
      throw new ApiError(403, "Only the person who paid can edit this expense.");
    }

    const participantIds = [
      ...new Set(expense.items.flatMap((i) => i.participants.map((p) => p.userId))),
    ];

    return {
      id: expense.id,
      groupId: expense.groupId,
      title: expense.title,
      totalCents: Math.round(Number(expense.totalAmount) * 100),
      paidById: expense.paidById,
      participantIds,
      itemised: expense.items.length > 1,
    };
  });
}

const updateExpenseSchema = z.object({
  expenseId: cuid,
  title: shortText("Title", 150),
  paidById: cuid,
  totalCents: positiveCents.optional(),
  participantIds: z.array(cuid).min(1, "Pick at least one participant.").optional(),
});

export async function updateExpense(input: {
  expenseId: string;
  title: string;
  paidById: string;
  totalCents?: number;
  participantIds?: string[];
}): Promise<ActionResult<{ groupId: string }>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const valid = validate(updateExpenseSchema, input);

    const expense = await db.expense.findUniqueOrThrow({
      where: { id: valid.expenseId },
      include: { items: true },
    });

    await assertMember(expense.groupId, session.id);
    if (expense.paidById !== session.id) {
      throw new ApiError(403, "Only the person who paid can edit this expense.");
    }

    const itemised = expense.items.length > 1;
    const changingAmounts = valid.totalCents !== undefined || valid.participantIds !== undefined;
    if (itemised && changingAmounts) {
      throw new ApiError(
        400,
        "This expense came from a receipt, so its amounts follow the scanned items. You can change the title and who paid — to change the split, delete it and add it again.",
      );
    }

    // Rewriting the single item is done in a transaction with the expense
    // update: a half-applied edit would leave the total disagreeing with the
    // shares, and the settlement engine would then compute a wrong balance.
    await db.$transaction(async (tx) => {
      await tx.expense.update({
        where: { id: expense.id },
        data: {
          title: valid.title,
          paidById: valid.paidById,
          ...(valid.totalCents !== undefined
            ? { totalAmount: fromCents(valid.totalCents) }
            : {}),
        },
      });

      if (!itemised && valid.totalCents !== undefined && valid.participantIds) {
        const shares = splitToShareRatios(
          valid.totalCents,
          valid.participantIds,
          "EQUAL",
        );

        // Replacing rather than patching: participants may have been added or
        // removed, and the cascade clears the old rows cleanly.
        await tx.expenseItem.deleteMany({ where: { expenseId: expense.id } });
        await tx.expenseItem.create({
          data: {
            expenseId: expense.id,
            label: valid.title,
            amount: fromCents(valid.totalCents),
            splitType: "EQUAL",
            participants: {
              create: valid.participantIds.map((userId) => ({
                userId,
                shareRatio: shares[userId],
              })),
            },
          },
        });
      }
    });

    await recalculateSettlements(expense.groupId);
    revalidatePath(`/groups/${expense.groupId}`);
    revalidatePath(`/groups/${expense.groupId}/settle`);

    return { groupId: expense.groupId };
  });
}

// Deleting is restricted to whoever paid, matching forgiveIOU — a money
// record belongs to the person who put the money in, and letting any member
// erase someone else's expense would quietly rewrite what everyone owes.
//
// This is a hard delete: Prisma cascades clear the items, their participants
// and any guest tokens pointing at the expense, so nothing dangles. A wrong
// amount should genuinely leave the maths rather than linger hidden.
export async function deleteExpense(expenseId: string): Promise<ActionResult<void>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const validExpenseId = validate(cuid, expenseId);

    const expense = await db.expense.findUniqueOrThrow({
      where: { id: validExpenseId },
      select: { id: true, groupId: true, paidById: true },
    });

    await assertMember(expense.groupId, session.id);
    if (expense.paidById !== session.id) {
      throw new ApiError(403, "Only the person who paid can delete this expense.");
    }

    await db.expense.delete({ where: { id: expense.id } });
    await recalculateSettlements(expense.groupId);

    revalidatePath(`/groups/${expense.groupId}`);
    revalidatePath(`/groups/${expense.groupId}/settle`);
  });
}

export async function listGroupExpenses(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const expenses = await db.expense.findMany({
    where: { groupId },
    include: {
      paidBy: true,
      items: { include: { participants: { include: { user: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return expenses.map((e) => {
    // An expense can have several items, and a person can appear in more than
    // one of them — dedupe so "shared by" names each person once.
    const byId = new Map<string, string>();
    for (const item of e.items) {
      for (const p of item.participants) byId.set(p.userId, p.user.displayName);
    }

    return {
      id: e.id,
      title: e.title,
      totalAmount: Number(e.totalAmount),
      paidByName: e.paidBy.displayName,
      // The row needs this to decide whether to offer a delete control, since
      // only the payer may remove it.
      paidById: e.paidById,
      participants: [...byId].map(([id, name]) => ({ id, name })),
      createdAt: e.createdAt.toISOString(),
    };
  });
}
