"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import { validate, cuid, shortText } from "@/lib/validation";
import { toCents } from "@/lib/money";
import { refuseLeave, type LeaveRefusal } from "@/lib/leaving";
import { asActionResult, type ActionResult } from "@/lib/action-result";

export async function createGroup(name: string): Promise<ActionResult<{ id: string; name: string }>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const validName = validate(shortText("Group name", 100), name);

    const group = await db.group.create({
      data: {
        name: validName,
        createdById: session.id,
        members: { create: { userId: session.id } },
      },
    });

    revalidatePath("/groups");
    return { id: group.id, name: group.name };
  });
}

export async function addMemberByEmail(
  groupId: string,
  email: string,
): Promise<ActionResult<{ id: string; displayName: string; email: string }>> {
  return asActionResult(async () => {
    const session = await requireSession();
    validate(cuid, groupId);
    const validEmail = validate(z.string().trim().email("Enter a valid email address."), email);
    await assertMember(groupId, session.id);

    const user = await db.user.findUnique({ where: { email: validEmail } });
    if (!user) {
      throw new ApiError(
        404,
        "No Reckon account with that email yet — ask them to sign up first.",
      );
    }

    const existing = await db.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: user.id } },
    });

    if (existing && !existing.leftAt) {
      throw new ApiError(409, "Already a member of this group.");
    }

    if (existing) {
      // They were here before and left. The row survives so their history
      // stays attached, so rejoining is reviving it rather than making a new
      // one — a fresh insert would collide with the unique index anyway.
      await db.groupMember.update({
        where: { id: existing.id },
        data: { leftAt: null, joinedAt: new Date() },
      });
    } else {
      await db.groupMember.create({ data: { groupId, userId: user.id } });
    }
    revalidatePath(`/groups/${groupId}`);
    return { id: user.id, displayName: user.displayName, email: user.email };
  });
}

export async function listMyGroups() {
  const session = await requireSession();
  const memberships = await db.groupMember.findMany({
    where: { userId: session.id, leftAt: null },
    include: { group: true },
    orderBy: { group: { createdAt: "desc" } },
  });
  return memberships.map((m) => ({ id: m.group.id, name: m.group.name }));
}

export type PastGroup = {
  id: string;
  name: string;
  joinedAt: string;
  leftAt: string;
  /** Who was in it — the reason to keep the entry at all. */
  memberNames: string[];
};

// Groups you were once in. Kept because "which flat was that, and who was I
// living with?" is a question people genuinely ask a year later, and the
// answer is already in the database.
export async function listPastGroups(): Promise<PastGroup[]> {
  const session = await requireSession();

  const memberships = await db.groupMember.findMany({
    where: { userId: session.id, leftAt: { not: null } },
    include: {
      group: {
        include: {
          // Everyone who was ever in it, not just who's there now — the point
          // is who you shared it with, and some of them will have left too.
          members: { include: { user: { select: { displayName: true } } } },
        },
      },
    },
    orderBy: { leftAt: "desc" },
  });

  return memberships.map((m) => ({
    id: m.group.id,
    name: m.group.name,
    joinedAt: m.joinedAt.toISOString(),
    leftAt: (m.leftAt as Date).toISOString(),
    memberNames: m.group.members
      .filter((other) => other.userId !== session.id)
      .map((other) => other.user.displayName),
  }));
}

// The access gate for a group page, to be awaited BEFORE anything else the
// page loads.
//
// Page data comes from actions that call assertMember, which throws a 403.
// Run alongside getGroup in a Promise.all, that 403 races the 404 and often
// wins — so someone who left a group saw "Something went wrong on our end"
// instead of a plain "can't find that". Gating first makes the 404 the only
// possible answer.
export async function requireGroupAccess(groupId: string) {
  const session = await requireSession();
  const membership = await db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: session.id } },
  });
  if (!membership || membership.leftAt) notFound();
  return session;
}

// Used to render pages, unlike assertMember (used to gate mutations) — a
// missing group and "not your group" both 404 here rather than leaking a
// 403, so a stranger can't tell the difference between "doesn't exist" and
// "exists but isn't yours".
export async function getGroup(groupId: string) {
  const session = await requireSession();

  const membership = await db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: session.id } },
  });
  // Someone who has left keeps their history but loses the room, so this is
  // a 404 for them exactly as it is for a stranger.
  if (!membership || membership.leftAt) notFound();

  const group = await db.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        where: { leftAt: null },
        include: { user: true },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!group) notFound();

  return {
    id: group.id,
    name: group.name,
    currency: group.currency,
    members: group.members.map((m) => ({
      id: m.user.id,
      displayName: m.user.displayName,
      email: m.user.email,
      // Answers "why is their effort bar low?" without anyone having to ask.
      joinedAt: m.joinedAt.toISOString(),
    })),
  };
}

export async function updateGroupCurrency(groupId: string, currency: string) {
  const session = await requireSession();
  validate(cuid, groupId);
  const validCurrency = validate(z.string().regex(/^[A-Z]{3}$/, "Not a valid currency code."), currency);
  await assertMember(groupId, session.id);

  await db.group.update({ where: { id: groupId }, data: { currency: validCurrency } });
  revalidatePath(`/groups/${groupId}`);
}

const LEAVE_REFUSAL: Record<LeaveRefusal, string> = {
  notAMember: "You're not in this group.",
  alreadyLeft: "You've already left this group.",
  owesMoney:
    "You still owe money in this group. Settle up first — leaving now would leave a debt nobody can clear.",
  owedMoney:
    "You're still owed money in this group. Collect it first — leaving now would leave whoever owes you unable to settle.",
};

// Leaving keeps the membership row and marks it. Deleting it would strand
// every expense, settlement and chore with this person's name on it, and
// quietly change what everyone else owes — walking out shouldn't move anybody
// else's balance.
export async function leaveGroup(groupId: string): Promise<ActionResult<void>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const validId = validate(cuid, groupId);

    const membership = await db.groupMember.findUnique({
      where: { groupId_userId: { groupId: validId, userId: session.id } },
    });

    // Read from the settlements already computed for this group rather than
    // recomputing: they're the same numbers the settle screen shows, so the
    // refusal can never disagree with what the person is looking at.
    const settlements = await db.settlement.findMany({
      where: {
        groupId: validId,
        OR: [{ fromUserId: session.id }, { toUserId: session.id }],
      },
    });

    const balanceCents = settlements.reduce((sum, s) => {
      const cents = toCents(s.amount);
      return sum + (s.toUserId === session.id ? cents : -cents);
    }, 0);

    const refusal = refuseLeave({
      isMember: Boolean(membership),
      alreadyLeft: Boolean(membership?.leftAt),
      balanceCents,
    });
    if (refusal) throw new ApiError(400, LEAVE_REFUSAL[refusal]);

    await db.groupMember.update({
      where: { id: (membership as { id: string }).id },
      data: { leftAt: new Date() },
    });

    // Their chores go back in the pot, and anything they'd offered to swap is
    // no longer theirs to offer.
    await db.choreSwapRequest.updateMany({
      where: {
        groupId: validId,
        status: "PENDING",
        OR: [
          { fromAssignment: { userId: session.id } },
          { toAssignment: { userId: session.id } },
        ],
      },
      data: { status: "CANCELLED", resolvedAt: new Date() },
    });

    revalidatePath("/groups");
    revalidatePath(`/groups/${validId}`);
  });
}

export async function assertMember(groupId: string, userId: string) {
  const membership = await db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  // A past membership is not a membership. Without the leftAt check, someone
  // who left could still add expenses and answer swaps in a group they walked
  // out of, because the row is still there by design.
  if (!membership || membership.leftAt) {
    throw new ApiError(403, "Not a member of this group.");
  }
}
