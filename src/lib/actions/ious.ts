"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import { fromCents } from "@/lib/money";
import { recalculateSettlements } from "@/lib/actions/settlements";

export async function addIOU(input: {
  groupId: string;
  owedByUserId: string;
  amountCents: number;
  note?: string;
}) {
  const session = await requireSession();
  await assertMember(input.groupId, session.id);
  if (input.amountCents <= 0) throw new ApiError(400, "Amount must be positive.");
  if (input.owedByUserId === session.id) {
    throw new ApiError(400, "You can't lend to yourself.");
  }

  await db.iOU.create({
    data: {
      groupId: input.groupId,
      fromUserId: input.owedByUserId,
      toUserId: session.id,
      amount: fromCents(input.amountCents),
      note: input.note,
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
