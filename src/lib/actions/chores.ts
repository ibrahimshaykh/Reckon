"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
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
    db.groupMember.findMany({ where: { groupId }, include: { user: true } }),
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

  return chores.map((c) => {
    const current = c.assignments[0];
    return {
      id: c.id,
      name: c.name,
      effortWeight: c.effortWeight,
      frequency: c.frequency,
      currentAssignee: current?.user.displayName ?? null,
      // The row needs this to know whether the chore is the reader's to offer.
      currentAssigneeId: current?.userId ?? null,
      periodEnd: current?.periodEnd.toISOString() ?? null,
      // Assignments made before this was structured still hold {steps}; the
      // renderer falls back to those rather than showing nothing.
      explanation: (current?.explanation as ChoreExplanation | undefined) ?? null,
      assignmentId: current?.id ?? null,
      completedAt: current?.completedAt?.toISOString() ?? null,
    };
  });
}

// Any member can mark a chore done — in a small trusted household,
// whoever notices it happened should be able to record it, not just
// whoever it was assigned to.
export async function completeChore(assignmentId: string) {
  const session = await requireSession();
  const assignment = await db.choreAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { chore: true },
  });
  await assertMember(assignment.chore.groupId, session.id);

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
    db.groupMember.findMany({ where: { groupId }, include: { user: true } }),
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
