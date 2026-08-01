"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/dal";
import { assertMember } from "@/lib/actions/groups";
import { ApiError } from "@/lib/api-error";
import { validate, cuid } from "@/lib/validation";
import { refuseSwap, type SwapRefusal, type SwapSide } from "@/lib/chore-swap";
import { asActionResult, type ActionResult } from "@/lib/action-result";

const REFUSAL_MESSAGE: Record<SwapRefusal, string> = {
  sameAssignment: "That's the same chore.",
  samePerson: "Both of those are already yours.",
  notYours: "You can only offer a chore that's assigned to you.",
  differentGroups: "Those chores belong to different groups.",
  alreadyDone: "One of those is already done, so swapping it would move credit for work that's finished.",
  periodOver: "That turn has already ended — the next rotation will reassign it anyway.",
};

const assignmentInclude = {
  chore: { select: { groupId: true, name: true } },
  user: { select: { displayName: true } },
} as const;

function toSide(assignment: {
  id: string;
  userId: string;
  completedAt: Date | null;
  periodEnd: Date;
  chore: { groupId: string };
}): SwapSide {
  return {
    assignmentId: assignment.id,
    userId: assignment.userId,
    groupId: assignment.chore.groupId,
    completedAt: assignment.completedAt,
    periodEnd: assignment.periodEnd,
  };
}

const proposeSchema = z.object({
  myAssignmentId: cuid,
  theirAssignmentId: cuid,
});

export async function proposeSwap(input: {
  myAssignmentId: string;
  theirAssignmentId: string;
}): Promise<ActionResult<void>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const valid = validate(proposeSchema, input);

    const [mine, theirs] = await Promise.all([
      db.choreAssignment.findUniqueOrThrow({
        where: { id: valid.myAssignmentId },
        include: assignmentInclude,
      }),
      db.choreAssignment.findUniqueOrThrow({
        where: { id: valid.theirAssignmentId },
        include: assignmentInclude,
      }),
    ]);

    await assertMember(mine.chore.groupId, session.id);

    const refusal = refuseSwap({
      mine: toSide(mine),
      theirs: toSide(theirs),
      requesterId: session.id,
      now: new Date(),
    });
    if (refusal) throw new ApiError(400, REFUSAL_MESSAGE[refusal]);

    // The unique index on (from, to) where PENDING is the real guard against
    // double-clicks; this just turns the collision into a sentence.
    const existing = await db.choreSwapRequest.findFirst({
      where: {
        fromAssignmentId: mine.id,
        toAssignmentId: theirs.id,
        status: "PENDING",
      },
    });
    if (existing) {
      throw new ApiError(400, "You've already asked — they haven't answered yet.");
    }

    await db.choreSwapRequest.create({
      data: {
        groupId: mine.chore.groupId,
        fromAssignmentId: mine.id,
        toAssignmentId: theirs.id,
      },
    });

    revalidatePath(`/groups/${mine.chore.groupId}/chores`);
  });
}

const respondSchema = z.object({ swapId: cuid, accept: z.boolean() });

export async function respondToSwap(input: {
  swapId: string;
  accept: boolean;
}): Promise<ActionResult<void>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const valid = validate(respondSchema, input);

    const swap = await db.choreSwapRequest.findUniqueOrThrow({
      where: { id: valid.swapId },
      include: {
        fromAssignment: { include: assignmentInclude },
        toAssignment: { include: assignmentInclude },
      },
    });

    await assertMember(swap.groupId, session.id);

    // Only the person being asked can answer. Without this the asker could
    // accept on the other's behalf, which is just taking their chore.
    if (swap.toAssignment.userId !== session.id) {
      throw new ApiError(403, "Only the person who was asked can answer this.");
    }
    if (swap.status !== "PENDING") {
      throw new ApiError(400, "That request has already been answered.");
    }

    if (!valid.accept) {
      await db.choreSwapRequest.update({
        where: { id: swap.id },
        data: { status: "DECLINED", resolvedAt: new Date() },
      });
      revalidatePath(`/groups/${swap.groupId}/chores`);
      return;
    }

    // Re-checked at the moment of acceptance, not just when it was offered:
    // either chore could have been completed while the request sat waiting,
    // and swapping a finished one moves credit for work already done.
    const refusal = refuseSwap({
      mine: toSide(swap.fromAssignment),
      theirs: toSide(swap.toAssignment),
      requesterId: swap.fromAssignment.userId,
      now: new Date(),
    });
    if (refusal) throw new ApiError(400, REFUSAL_MESSAGE[refusal]);

    // Swapping the assignees is the whole operation. Effort is credited on
    // completion, so the fairness ledger follows whoever actually does the
    // work without anything else being touched.
    await db.$transaction([
      db.choreAssignment.update({
        where: { id: swap.fromAssignmentId },
        data: { userId: swap.toAssignment.userId },
      }),
      db.choreAssignment.update({
        where: { id: swap.toAssignmentId },
        data: { userId: swap.fromAssignment.userId },
      }),
      db.choreSwapRequest.update({
        where: { id: swap.id },
        data: { status: "ACCEPTED", resolvedAt: new Date() },
      }),
      // Any other offer involving either chore is now stale — the people
      // attached to them have changed.
      db.choreSwapRequest.updateMany({
        where: {
          status: "PENDING",
          id: { not: swap.id },
          OR: [
            { fromAssignmentId: { in: [swap.fromAssignmentId, swap.toAssignmentId] } },
            { toAssignmentId: { in: [swap.fromAssignmentId, swap.toAssignmentId] } },
          ],
        },
        data: { status: "CANCELLED", resolvedAt: new Date() },
      }),
    ]);

    revalidatePath(`/groups/${swap.groupId}/chores`);
  });
}

export async function cancelSwap(swapId: string): Promise<ActionResult<void>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const validId = validate(cuid, swapId);

    const swap = await db.choreSwapRequest.findUniqueOrThrow({
      where: { id: validId },
      include: { fromAssignment: true },
    });
    await assertMember(swap.groupId, session.id);

    if (swap.fromAssignment.userId !== session.id) {
      throw new ApiError(403, "Only the person who asked can take it back.");
    }
    if (swap.status !== "PENDING") return;

    await db.choreSwapRequest.update({
      where: { id: swap.id },
      data: { status: "CANCELLED", resolvedAt: new Date() },
    });

    revalidatePath(`/groups/${swap.groupId}/chores`);
  });
}

export type SwapOffer = {
  id: string;
  /** Who asked. */
  fromName: string;
  /** Who was asked — the one an outgoing offer is waiting on. */
  toName: string;
  fromChore: string;
  toChore: string;
  /** True when this person is the one being asked, rather than the asker. */
  incoming: boolean;
};

/** Live offers touching this person, either direction. */
export async function listSwapOffers(groupId: string): Promise<SwapOffer[]> {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const swaps = await db.choreSwapRequest.findMany({
    where: {
      groupId,
      status: "PENDING",
      OR: [
        { fromAssignment: { userId: session.id } },
        { toAssignment: { userId: session.id } },
      ],
    },
    include: {
      fromAssignment: { include: assignmentInclude },
      toAssignment: { include: assignmentInclude },
    },
    orderBy: { createdAt: "desc" },
  });

  return swaps.map((s) => ({
    id: s.id,
    fromName: s.fromAssignment.user.displayName,
    toName: s.toAssignment.user.displayName,
    fromChore: s.fromAssignment.chore.name,
    toChore: s.toAssignment.chore.name,
    incoming: s.toAssignment.userId === session.id,
  }));
}
