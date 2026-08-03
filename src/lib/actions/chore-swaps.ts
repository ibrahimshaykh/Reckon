"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/dal";
import { assertMember } from "@/lib/actions/groups";
import { ApiError } from "@/lib/api-error";
import { validate, cuid } from "@/lib/validation";
import {
  refuseSwap,
  callExhausted,
  type SwapRefusal,
  type SwapSide,
} from "@/lib/chore-swap";
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
  chore: { select: { groupId: true, name: true, effortWeight: true } },
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
        // Accepting swaps the assignees, so afterwards the assignments no
        // longer say who started this — and they're the one owed an answer.
        requesterId: session.id,
      },
    });

    revalidatePath(`/groups/${mine.chore.groupId}/chores`);
  });
}

// "Anyone want this?" — no target, first willing taker gets it. Asking one
// person at a time means guessing who'll say yes; in a flat of four that's
// three separate asks.
export async function openSwapCall(assignmentId: string): Promise<ActionResult<void>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const validId = validate(cuid, assignmentId);

    const mine = await db.choreAssignment.findUniqueOrThrow({
      where: { id: validId },
      include: assignmentInclude,
    });
    await assertMember(mine.chore.groupId, session.id);

    if (mine.userId !== session.id) {
      throw new ApiError(400, REFUSAL_MESSAGE.notYours);
    }
    if (mine.completedAt !== null) {
      throw new ApiError(400, REFUSAL_MESSAGE.alreadyDone);
    }
    if (mine.periodEnd < new Date()) {
      throw new ApiError(400, REFUSAL_MESSAGE.periodOver);
    }

    const existing = await db.choreSwapRequest.findFirst({
      where: { fromAssignmentId: mine.id, toAssignmentId: null, status: "PENDING" },
    });
    if (existing) {
      throw new ApiError(400, "You've already asked the group about this one.");
    }

    await db.choreSwapRequest.create({
      data: {
        groupId: mine.chore.groupId,
        fromAssignmentId: mine.id,
        toAssignmentId: null,
        requesterId: session.id,
      },
    });

    revalidatePath(`/groups/${mine.chore.groupId}/chores`);
  });
}

const claimSchema = z.object({ callId: cuid, myAssignmentId: cuid });

// Taking an open call. First come, first swapped — so the claim has to win a
// race, not merely pass a check.
export async function claimSwapCall(input: {
  callId: string;
  myAssignmentId: string;
}): Promise<ActionResult<void>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const valid = validate(claimSchema, input);

    const [call, mine] = await Promise.all([
      db.choreSwapRequest.findUniqueOrThrow({
        where: { id: valid.callId },
        include: { fromAssignment: { include: assignmentInclude } },
      }),
      db.choreAssignment.findUniqueOrThrow({
        where: { id: valid.myAssignmentId },
        include: assignmentInclude,
      }),
    ]);

    await assertMember(call.groupId, session.id);

    if (call.toAssignmentId !== null) {
      throw new ApiError(400, "That was a direct request, not an open call.");
    }

    // Same rules as a directed swap, read from the claimer's side: they are
    // the one offering their own chore up.
    const refusal = refuseSwap({
      mine: toSide(mine),
      theirs: toSide(call.fromAssignment),
      requesterId: session.id,
      now: new Date(),
    });
    if (refusal) throw new ApiError(400, REFUSAL_MESSAGE[refusal]);

    await db.$transaction(async (tx) => {
      // The whole race comes down to this line: only one caller can move the
      // row out of PENDING, and the loser sees a count of zero rather than
      // quietly performing a second swap on top of the first.
      const claimed = await tx.choreSwapRequest.updateMany({
        where: { id: call.id, status: "PENDING", toAssignmentId: null },
        data: {
          toAssignmentId: mine.id,
          status: "ACCEPTED",
          resolvedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new ApiError(400, "Someone else took that one first.");
      }

      await tx.choreAssignment.update({
        where: { id: call.fromAssignmentId },
        data: { userId: mine.userId },
      });
      await tx.choreAssignment.update({
        where: { id: mine.id },
        data: { userId: call.fromAssignment.userId },
      });

      // Anything else pending on either chore is stale now.
      await tx.choreSwapRequest.updateMany({
        where: {
          status: "PENDING",
          id: { not: call.id },
          OR: [
            { fromAssignmentId: { in: [call.fromAssignmentId, mine.id] } },
            { toAssignmentId: { in: [call.fromAssignmentId, mine.id] } },
          ],
        },
        data: { status: "CANCELLED", resolvedAt: new Date() },
      });
    });

    revalidatePath(`/groups/${call.groupId}/chores`);
  });
}

// "Not me." Saying out loud that you won't take an open call.
//
// Without this, silence means two different things — nobody looked, or
// everybody refused — and the asker can't tell which, so the call just hangs
// there. Once everyone else has passed, it closes with an answer.
export async function passSwapCall(callId: string): Promise<ActionResult<void>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const validId = validate(cuid, callId);

    const call = await db.choreSwapRequest.findUniqueOrThrow({
      where: { id: validId },
      include: { fromAssignment: true },
    });
    await assertMember(call.groupId, session.id);

    if (call.toAssignmentId !== null) {
      throw new ApiError(400, "That's a direct request — decline it instead.");
    }
    if (call.status !== "PENDING") return;
    if (call.fromAssignment.userId === session.id) {
      throw new ApiError(400, "You're the one asking.");
    }

    // Upsert rather than create: pressing twice shouldn't count twice and
    // close the call early on everybody else's behalf.
    await db.choreSwapPass.upsert({
      where: { requestId_userId: { requestId: call.id, userId: session.id } },
      update: {},
      create: { requestId: call.id, userId: session.id },
    });

    const [passes, memberCount] = await Promise.all([
      db.choreSwapPass.count({ where: { requestId: call.id } }),
      db.groupMember.count({ where: { groupId: call.groupId, leftAt: null } }),
    ]);

    // Once everyone else has said no, there's nothing left to wait for.
    if (callExhausted(passes, memberCount)) {
      await db.choreSwapRequest.updateMany({
        where: { id: call.id, status: "PENDING" },
        data: { status: "NO_TAKERS", resolvedAt: new Date() },
      });
    }

    revalidatePath(`/groups/${call.groupId}/chores`);
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

    // An open call has nobody to answer it yet — it's claimed, not accepted.
    if (!swap.toAssignment) {
      throw new ApiError(400, "That's an open call — take it instead of answering it.");
    }

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
    // Narrowed above, but pulled out so the transaction reads without the
    // non-null assertions the compiler would otherwise want on every line.
    const target = swap.toAssignment;
    const targetId = swap.toAssignmentId as string;

    await db.$transaction([
      db.choreAssignment.update({
        where: { id: swap.fromAssignmentId },
        data: { userId: target.userId },
      }),
      db.choreAssignment.update({
        where: { id: targetId },
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
            { fromAssignmentId: { in: [swap.fromAssignmentId, targetId] } },
            { toAssignmentId: { in: [swap.fromAssignmentId, targetId] } },
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

// Acknowledging how a swap turned out, so the answer stops following you
// around. Separate from the request's status because an accepted swap has to
// stay ACCEPTED — the chore rows read it to say "swapped with X".
export async function dismissSwapNotice(swapId: string): Promise<ActionResult<void>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const validId = validate(cuid, swapId);

    const swap = await db.choreSwapRequest.findUniqueOrThrow({
      where: { id: validId },
      select: { id: true, groupId: true },
    });
    await assertMember(swap.groupId, session.id);

    await db.choreSwapNotice.upsert({
      where: { requestId_userId: { requestId: swap.id, userId: session.id } },
      update: {},
      create: { requestId: swap.id, userId: session.id },
    });

    revalidatePath(`/groups/${swap.groupId}/chores`);
  });
}

export type SwapOffer = {
  id: string;
  /**
   * incoming  — someone asked you directly, answer it
   * outgoing  — you asked someone, waiting on them
   * openCall  — someone asked the group; you can take it
   * myCall    — you asked the group, waiting for a taker
   */
  kind: "incoming" | "outgoing" | "openCall" | "myCall" | "noTakers";
  fromName: string;
  toName: string | null;
  fromChore: string;
  /** Effort of the chore on offer, so nobody claims blind. */
  fromEffort: number;
  toChore: string | null;
  /** How many have said "not me", out of how many could have taken it. */
  passCount: number;
  passTotal: number;
  /** Whether the reader has already passed, so the button can stand down. */
  iPassed: boolean;
};

/** Anything live this person could act on: their own swaps, plus open calls. */
export async function listSwapOffers(groupId: string): Promise<SwapOffer[]> {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const memberCount = await db.groupMember.count({ where: { groupId, leftAt: null } });

  const swaps = await db.choreSwapRequest.findMany({
    where: {
      groupId,
      // A turn that's already over is about to be reassigned by the next
      // rotation, so a swap for it is noise rather than a decision.
      fromAssignment: { periodEnd: { gt: new Date() }, completedAt: null },
      // Two independent conditions, so they go in AND rather than as two OR
      // keys on the same object — the second would silently replace the first.
      AND: [
        {
          OR: [
            { status: "PENDING" as const },
            // A closed call is shown only to the person who asked: they're
            // the one who needs to hear the answer came back no.
            {
              status: "NO_TAKERS" as const,
              fromAssignment: { userId: session.id },
            },
          ],
        },
        {
          OR: [
            { fromAssignment: { userId: session.id } },
            { toAssignment: { userId: session.id } },
            // Open calls are everyone's business — that's the point of them.
            { toAssignmentId: null },
          ],
        },
      ],
    },
    include: {
      fromAssignment: { include: assignmentInclude },
      toAssignment: { include: assignmentInclude },
      passes: { select: { userId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return swaps.map((s) => {
    const mineIsAsker = s.fromAssignment.userId === session.id;
    const kind =
      s.status === "NO_TAKERS"
        ? ("noTakers" as const)
        : s.toAssignment
          ? s.toAssignment.userId === session.id
            ? ("incoming" as const)
            : ("outgoing" as const)
          : mineIsAsker
            ? ("myCall" as const)
            : ("openCall" as const);

    return {
      id: s.id,
      kind,
      fromName: s.fromAssignment.user.displayName,
      toName: s.toAssignment?.user.displayName ?? null,
      fromChore: s.fromAssignment.chore.name,
      fromEffort: s.fromAssignment.chore.effortWeight,
      toChore: s.toAssignment?.chore.name ?? null,
      passCount: s.passes.length,
      // Everyone except whoever asked.
      passTotal: Math.max(memberCount - 1, 0),
      iPassed: s.passes.some((p) => p.userId === session.id),
    };
  });
}
