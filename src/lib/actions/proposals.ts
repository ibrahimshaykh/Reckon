"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import { toCents } from "@/lib/money";
import { computeProposalFlags } from "@/lib/constraint-check";
import { pickFairestMeetingPoint, totalTravelDistanceKm } from "@/lib/fair-meeting-point";

export async function createProposal(input: {
  groupId: string;
  title: string;
  estimatedCostPerPersonCents: number | null;
  dietaryTags: string[];
  latitude?: number | null;
  longitude?: number | null;
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
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
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

  const [proposals, members] = await Promise.all([
    db.proposal.findMany({
      where: { groupId },
      include: { proposedBy: true, flags: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.groupMember.findMany({ where: { groupId }, include: { user: true } }),
  ]);

  const homes = members
    .filter((m) => m.user.homeLatitude !== null && m.user.homeLongitude !== null)
    .map((m) => ({ latitude: m.user.homeLatitude!, longitude: m.user.homeLongitude! }));

  const withLocation = proposals.filter((p) => p.latitude !== null && p.longitude !== null);
  const fairest =
    homes.length > 0
      ? pickFairestMeetingPoint(
          withLocation.map((p) => ({
            proposalId: p.id,
            location: { latitude: p.latitude!, longitude: p.longitude! },
          })),
          homes,
        )
      : null;

  const memberHomes = members
    .filter((m) => m.user.homeLatitude !== null && m.user.homeLongitude !== null)
    .map((m) => ({
      userId: m.userId,
      displayName: m.user.displayName,
      latitude: m.user.homeLatitude!,
      longitude: m.user.homeLongitude!,
    }));

  const mappedProposals = proposals.map((p) => {
    const hasLocation = p.latitude !== null && p.longitude !== null;
    const totalDistanceKm =
      hasLocation && homes.length > 0
        ? totalTravelDistanceKm({ latitude: p.latitude!, longitude: p.longitude! }, homes)
        : null;

    return {
      id: p.id,
      title: p.title,
      proposedByName: p.proposedBy.displayName,
      estimatedCostPerPerson:
        p.estimatedCostPerPerson === null ? null : Number(p.estimatedCostPerPerson),
      dietaryTags: p.dietaryTags,
      latitude: p.latitude,
      longitude: p.longitude,
      totalDistanceKm,
      isFairestPick: fairest?.proposalId === p.id,
      flags: p.flags.map((f) => ({
        userName: f.user.displayName,
        reason: f.reason,
        detail: f.detail,
      })),
    };
  });

  return { proposals: mappedProposals, memberHomes };
}
