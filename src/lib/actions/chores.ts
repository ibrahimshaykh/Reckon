"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { ApiError } from "@/lib/api-error";
import { requireSession } from "@/lib/dal";
import { validate, cuid, shortText } from "@/lib/validation";
import { assignChoresWithTrace } from "@/lib/chore-rotation";
import type { ChoreExplanation } from "@/lib/chore-explanation";

type Frequency = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";

const createChoreSchema = z.object({
  groupId: cuid,
  name: shortText("Chore name", 100),
  effortWeight: z.number().int().min(1, "Effort must be at least 1.").max(100),
  frequency: z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]),
});

function periodLengthDays(frequency: Frequency): number {
  switch (frequency) {
    case "DAILY":
      return 1;
    case "WEEKLY":
      return 7;
    case "BIWEEKLY":
      return 14;
    case "MONTHLY":
      return 30;
  }
}

export async function createChore(input: {
  groupId: string;
  name: string;
  effortWeight: number;
  frequency: Frequency;
}) {
  const session = await requireSession();
  const valid = validate(createChoreSchema, input);
  await assertMember(valid.groupId, session.id);

  await db.chore.create({
    data: {
      groupId: valid.groupId,
      name: valid.name,
      effortWeight: valid.effortWeight,
      frequency: valid.frequency,
    },
  });

  revalidatePath(`/groups/${input.groupId}/chores`);
}

export async function rotateChores(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const [chores, members, pastAssignments] = await Promise.all([
    db.chore.findMany({ where: { groupId } }),
    db.groupMember.findMany({ where: { groupId, leftAt: null }, include: { user: true } }),
    db.choreAssignment.findMany({ where: { chore: { groupId } } }),
  ]);

  const now = new Date();
  const needsAssignment = chores.filter((chore) => {
    const latest = pastAssignments
      .filter((a) => a.choreId === chore.id)
      .sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime())[0];
    return !latest || latest.periodEnd < now;
  });

  if (needsAssignment.length === 0 || members.length === 0) {
    return { created: 0 };
  }

  const cumulative: Record<string, number> = {};
  members.forEach((m) => (cumulative[m.userId] = 0));
  pastAssignments.forEach((a) => {
    const chore = chores.find((c) => c.id === a.choreId);
    if (chore) cumulative[a.userId] = (cumulative[a.userId] ?? 0) + chore.effortWeight;
  });

  const traces = assignChoresWithTrace(
    needsAssignment.map((c) => ({ id: c.id, effortWeight: c.effortWeight })),
    members.map((m) => ({ userId: m.userId, cumulativeEffort: cumulative[m.userId] ?? 0 })),
  );

  const nameOf = (id: string) =>
    members.find((m) => m.userId === id)?.user.displayName ?? id;

  await Promise.all(
    needsAssignment.map((chore) => {
      const trace = traces[chore.id];
      const periodEnd = new Date(
        now.getTime() + periodLengthDays(chore.frequency) * 86_400_000,
      );

      return db.choreAssignment.create({
        data: {
          choreId: chore.id,
          userId: trace.userId,
          periodStart: now,
          periodEnd,
          // Stored as data rather than finished sentences so the reason can be
          // read in the reader's own language, and so the round's whole split
          // travels with it. Seeing that the round came out even settles an
          // argument far better than being told your own share was fair.
          explanation: {
            choreName: chore.name,
            effortWeight: chore.effortWeight,
            assigneeName: nameOf(trace.userId),
            effortBefore: trace.effortBefore,
            firstRound: trace.firstRound,
            roundTotals: trace.roundTotals.map((t) => ({
              name: nameOf(t.userId),
              effort: t.effort,
            })),
          },
        },
      });
    }),
  );

  revalidatePath(`/groups/${groupId}/chores`);
  return { created: needsAssignment.length };
}

export async function listChores(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const chores = await db.chore.findMany({
    where: { groupId },
    include: {
      assignments: {
        orderBy: { periodStart: "desc" },
        take: 1,
        include: { user: true },
      },
    },
  });

  // Who a chore came from, when it arrived by swap.
  //
  // Without this the row contradicts itself: the rotation's explanation still
  // names whoever it originally picked, while the chore sits with somebody
  // else. That reads as a bug rather than as two people having agreed a trade.
  const currentIds = chores
    .map((c) => c.assignments[0]?.id)
    .filter((id): id is string => Boolean(id));

  const acceptedSwaps = currentIds.length
    ? await db.choreSwapRequest.findMany({
        where: {
          status: "ACCEPTED",
          OR: [
            { fromAssignmentId: { in: currentIds } },
            { toAssignmentId: { in: currentIds } },
          ],
        },
        include: {
          fromAssignment: { include: { user: { select: { displayName: true } } } },
          toAssignment: { include: { user: { select: { displayName: true } } } },
        },
        orderBy: { resolvedAt: "desc" },
      })
    : [];

  // Each side points at the OTHER side's current holder — that's the person
  // you traded with. Pointing an assignment at its own holder just prints the
  // assignee's name twice: "assigned to X (swapped with X)".
  const swappedWith = new Map<string, string>();
  for (const swap of acceptedSwaps) {
    if (!swap.toAssignment || !swap.toAssignmentId) continue;
    if (!swappedWith.has(swap.fromAssignmentId)) {
      swappedWith.set(swap.fromAssignmentId, swap.toAssignment.user.displayName);
    }
    if (!swappedWith.has(swap.toAssignmentId)) {
      swappedWith.set(swap.toAssignmentId, swap.fromAssignment.user.displayName);
    }
  }

  // What everyone is actually carrying right now.
  //
  // This used to be read from a snapshot taken when the rotation ran and
  // stored on the assignment. Swaps move chores afterwards and the snapshot
  // never moved with them, so the panel went on insisting a round was "even"
  // while the real split had drifted to 35 against 3. A fairness figure that
  // has stopped tracking reality is worse than showing no figure at all.
  const now = new Date();
  const liveLoad = new Map<string, number>();
  for (const chore of chores) {
    const assignment = chore.assignments[0];
    if (!assignment || assignment.periodEnd < now) continue;
    const name = assignment.user.displayName;
    liveLoad.set(name, (liveLoad.get(name) ?? 0) + chore.effortWeight);
  }

  const roundLoad = [...liveLoad]
    .map(([name, effort]) => ({ name, effort }))
    .sort((a, b) => b.effort - a.effort || a.name.localeCompare(b.name));

  return chores.map((c) => {
    const current = c.assignments[0];
    return {
      id: c.id,
      name: c.name,
      effortWeight: c.effortWeight,
      frequency: c.frequency,
      // The same for every row — it's the group's current standing, not this
      // chore's. Carried per row so each one can show it without refetching.
      roundLoad,
      currentAssignee: current?.user.displayName ?? null,
      // The row needs this to know whether the chore is the reader's to offer.
      currentAssigneeId: current?.userId ?? null,
      // Who it came from, if it arrived by swap — otherwise the rotation's
      // reasoning below appears to name the wrong person.
      swappedWith: current ? (swappedWith.get(current.id) ?? null) : null,
      periodEnd: current?.periodEnd.toISOString() ?? null,
      // Assignments made before this was structured still hold {steps}; the
      // renderer falls back to those rather than showing nothing.
      explanation: (current?.explanation as ChoreExplanation | undefined) ?? null,
      assignmentId: current?.id ?? null,
      completedAt: current?.completedAt?.toISOString() ?? null,
    };
  });
}

// Only the person a chore is assigned to can mark it done.
//
// This used to be open to any member, on the reasoning that whoever noticed
// should be able to record it. But completed effort is credited to the
// ASSIGNEE, not to whoever pressed the button — so marking someone else's
// chore done handed them credit for work they may not have done, and the next
// rotation then gave them lighter jobs for it. If somebody else actually did
// it, the honest route is to swap the chore, which moves the credit too.
export async function completeChore(assignmentId: string) {
  const session = await requireSession();
  const assignment = await db.choreAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { chore: true },
  });
  await assertMember(assignment.chore.groupId, session.id);

  if (assignment.userId !== session.id) {
    throw new ApiError(
      403,
      "Only the person it's assigned to can mark it done. Swap it first if you're taking it on.",
    );
  }

  await db.choreAssignment.update({
    where: { id: assignmentId },
    data: { completedAt: new Date() },
  });

  revalidatePath(`/groups/${assignment.chore.groupId}/chores`);
}

// Cumulative effort of chores each member has actually COMPLETED (not just
// been assigned) — the real "who's pulling their weight" signal, distinct
// from the rotation algorithm's assignment-fairness bookkeeping.
export async function getChoreFairness(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const [members, completedAssignments] = await Promise.all([
    db.groupMember.findMany({ where: { groupId, leftAt: null }, include: { user: true } }),
    db.choreAssignment.findMany({
      where: { chore: { groupId }, completedAt: { not: null } },
      include: { chore: true },
    }),
  ]);

  const effortByUser: Record<string, number> = {};
  members.forEach((m) => (effortByUser[m.userId] = 0));
  completedAssignments.forEach((a) => {
    effortByUser[a.userId] = (effortByUser[a.userId] ?? 0) + a.chore.effortWeight;
  });

  return members.map((m) => ({
    userId: m.userId,
    displayName: m.user.displayName,
    completedEffort: effortByUser[m.userId] ?? 0,
  }));
}
