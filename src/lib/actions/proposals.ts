"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import { toCents } from "@/lib/money";
import { computeProposalFlags } from "@/lib/constraint-check";

export async function createProposal(input: {
  groupId: string;
  title: string;
  estimatedCostPerPersonCents: number | null;
  dietaryTags: string[];
}) {
  const session = await requireSession();
  await assertMember(input.groupId, session.id);
  if (!input.title.trim()) throw new ApiError(400, "Title is required.");

  const members = await db.groupMember.findMany({
    where: { groupId: input.groupId },
    include: { user: true },
  });

  const flags = computeProposalFlags(
    {
      estimatedCostPerPersonCents: input.estimatedCostPerPersonCents,
      dietaryTags: input.dietaryTags,
    },
    members.map((m) => ({
      userId: m.userId,
      budgetLimitCents: m.user.budgetLimit === null ? null : toCents(m.user.budgetLimit),
      dietaryRestrictions: m.user.dietaryRestrictions,
    })),
  );

  await db.proposal.create({
    data: {
      groupId: input.groupId,
      proposedById: session.id,
      title: input.title.trim(),
      estimatedCostPerPerson:
        input.estimatedCostPerPersonCents === null
          ? null
          : input.estimatedCostPerPersonCents / 100,
      dietaryTags: input.dietaryTags,
      flags: {
        create: flags.map((f) => ({
          userId: f.userId,
          reason: f.reason,
          detail: f.detail,
        })),
      },
    },
  });

  revalidatePath(`/groups/${input.groupId}/proposals`);
}

export async function listProposals(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const proposals = await db.proposal.findMany({
    where: { groupId },
    include: { proposedBy: true, flags: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  });

  return proposals.map((p) => ({
    id: p.id,
    title: p.title,
    proposedByName: p.proposedBy.displayName,
    estimatedCostPerPerson:
      p.estimatedCostPerPerson === null ? null : Number(p.estimatedCostPerPerson),
    dietaryTags: p.dietaryTags,
    flags: p.flags.map((f) => ({
      userName: f.user.displayName,
      reason: f.reason,
      detail: f.detail,
    })),
  }));
}
