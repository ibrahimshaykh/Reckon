"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { toCents } from "@/lib/money";
import { validate, cuid, shortText, latitude, longitude } from "@/lib/validation";
import { computeProposalFlags } from "@/lib/constraint-check";
import { pickFairestMeetingPoint, totalTravelDistanceKm } from "@/lib/fair-meeting-point";
import { tallyVotes, computeProposalOutcome, type VoteChoice } from "@/lib/proposal-votes";

const createProposalSchema = z.object({
  groupId: cuid,
  title: shortText("Title", 150),
  estimatedCostPerPersonCents: z.number().int().min(0).nullable(),
  dietaryTags: z.array(z.string().trim().max(50)).max(20),
  latitude: latitude.nullable().optional(),
  longitude: longitude.nullable().optional(),
});

export async function createProposal(input: {
  groupId: string;
  title: string;
  estimatedCostPerPersonCents: number | null;
  dietaryTags: string[];
  latitude?: number | null;
  longitude?: number | null;
}) {
  const session = await requireSession();
  const valid = validate(createProposalSchema, input);
  await assertMember(valid.groupId, session.id);

  const members = await db.groupMember.findMany({
    where: { groupId: valid.groupId },
    include: { user: true },
  });

  const flags = computeProposalFlags(
    {
      estimatedCostPerPersonCents: valid.estimatedCostPerPersonCents,
      dietaryTags: valid.dietaryTags,
    },
    members.map((m) => ({
      userId: m.userId,
      budgetLimitCents: m.user.budgetLimit === null ? null : toCents(m.user.budgetLimit),
      dietaryRestrictions: m.user.dietaryRestrictions,
    })),
  );

  await db.proposal.create({
    data: {
      groupId: valid.groupId,
      proposedById: session.id,
      title: valid.title,
      estimatedCostPerPerson:
        valid.estimatedCostPerPersonCents === null
          ? null
          : valid.estimatedCostPerPersonCents / 100,
      dietaryTags: valid.dietaryTags,
      latitude: valid.latitude ?? null,
      longitude: valid.longitude ?? null,
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
      include: {
        proposedBy: true,
        flags: { include: { user: true } },
        votes: { include: { user: true } },
      },
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

    // Blind, simultaneous voting: your own choice never leaks anyone else's
    // until you've cast yours (or the proposal is already decided) — a
    // trusted friend group can still anchor on whoever votes first.
    const myVote = p.votes.find((v) => v.userId === session.id)?.choice ?? null;
    const revealed = myVote !== null || p.status !== "PROPOSED";

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
      status: p.status,
      myVote: myVote as VoteChoice | null,
      totalMembers: members.length,
      tally: revealed ? tallyVotes(p.votes) : null,
      voterBreakdown: revealed
        ? p.votes.map((v) => ({ userName: v.user.displayName, choice: v.choice as VoteChoice }))
        : null,
    };
  });

  return { proposals: mappedProposals, memberHomes };
}

export async function castVote(proposalId: string, choice: VoteChoice) {
  const session = await requireSession();
  const proposal = await db.proposal.findUniqueOrThrow({ where: { id: proposalId } });
  await assertMember(proposal.groupId, session.id);

  await db.proposalVote.upsert({
    where: { proposalId_userId: { proposalId, userId: session.id } },
    update: { choice },
    create: { proposalId, userId: session.id, choice },
  });

  if (proposal.status === "PROPOSED") {
    const [votes, memberCount] = await Promise.all([
      db.proposalVote.findMany({ where: { proposalId } }),
      db.groupMember.count({ where: { groupId: proposal.groupId } }),
    ]);

    const outcome = computeProposalOutcome(votes, memberCount);
    if (outcome) {
      await db.proposal.update({ where: { id: proposalId }, data: { status: outcome } });
    }
  }

  revalidatePath(`/groups/${proposal.groupId}/proposals`);
}
