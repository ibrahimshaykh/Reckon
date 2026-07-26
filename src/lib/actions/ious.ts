"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import { fromCents } from "@/lib/money";
import { validate, cuid, positiveCents } from "@/lib/validation";
import { recalculateSettlements } from "@/lib/actions/settlements";

const addIOUSchema = z.object({
  groupId: cuid,
  owedByUserId: cuid,
  amountCents: positiveCents,
  note: z.string().trim().max(300).optional(),
});

export async function addIOU(input: {
  groupId: string;
  owedByUserId: string;
  amountCents: number;
  note?: string;
}) {
  const session = await requireSession();
  const valid = validate(addIOUSchema, input);
  await assertMember(valid.groupId, session.id);
  if (valid.owedByUserId === session.id) {
    throw new ApiError(400, "You can't lend to yourself.");
  }

  await db.iOU.create({
    data: {
      groupId: valid.groupId,
      fromUserId: valid.owedByUserId,
      toUserId: session.id,
      amount: fromCents(valid.amountCents),
      note: valid.note,
    },
  });

  await recalculateSettlements(input.groupId);
  revalidatePath(`/groups/${input.groupId}/ious`);
  revalidatePath(`/groups/${input.groupId}/settle`);
}

export async function listIOUs(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const ious = await db.iOU.findMany({
    where: { groupId },
    include: { fromUser: true, toUser: true },
    orderBy: { createdAt: "desc" },
  });

  return ious.map((i) => ({
    id: i.id,
    fromName: i.fromUser.displayName,
    toName: i.toUser.displayName,
    amount: Number(i.amount),
    note: i.note,
    createdAt: i.createdAt.toISOString(),
  }));
}
