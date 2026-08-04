"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { ApiError } from "@/lib/api-error";
import { requireSession } from "@/lib/dal";
import { validate, cuid, shortText } from "@/lib/validation";
import { asActionResult, type ActionResult } from "@/lib/action-result";
import { rotateGroup } from "@/lib/rotate-group";
import { weightedEffort, asPerWeek, type ChoreFrequency } from "@/lib/chore-weight";
import { totalLoad, listMissed } from "@/lib/chore-load";
import { periodProgress } from "@/lib/chore-progress";
import { planRemoval } from "@/lib/chore-removal";
import { findDuplicate } from "@/lib/chore-duplicates";
import {
  dayWindow,
  markDoneBlock,
  occurrenceOn,
  periodEndFor,
  toIsoDate,
} from "@/lib/chore-schedule";
import { Prisma } from "@/generated/prisma/client";
import type { ChoreExplanation } from "@/lib/chore-explanation";

type Frequency = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";

const createChoreSchema = z.object({
  groupId: cuid,
  // Runs of whitespace collapse, because HTML collapses them when rendering
  // anyway: "deep  clean" and "deep   clean" are one chore on screen and two
  // in the table, which is exactly the pair nobody can tell apart.
  name: shortText("Chore name", 100).transform((n) => n.replace(/\s+/g, " ")),
  // One to ten, which is what the app has always told people it was asking
  // for — "you rated it 7 out of 10" — while quietly accepting up to a
  // hundred. Nobody has ever entered more than 10 in any group.
  effortWeight: z
    .number()
    .int()
    .min(1, "Effort must be at least 1.")
    .max(10, "Effort goes from 1 to 10."),
  frequency: z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]),
});

const DUPLICATE_CHORE_MESSAGE =
  "That chore is already on the list, with the same effort and how often it happens. Change one of those, or use the one that's there.";

// Wrapped, so the reasons it can refuse actually reach the person typing.
// Next redacts thrown Server Action errors in production, so a message like
// "that chore is already on the list" arrived as Next's generic wall of text
// — as did every validation message this already had.
export async function createChore(input: {
  groupId: string;
  name: string;
  effortWeight: number;
  frequency: Frequency;
}): Promise<ActionResult<void>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const valid = validate(createChoreSchema, input);
    await assertMember(valid.groupId, session.id);

    // A chore identical to one already on the list can't be told apart from it
    // afterwards: a swap offer naming it is ambiguous, and the rotation deals
    // out twice the work that was meant. Almost always a double-tap on Add —
    // which is exactly how the live group got two "kill cat" chores a minute
    // apart.
    //
    // Only fully identical chores are refused. A daily "kitchen" alongside a
    // weekly one is a fair thing to want, and those two read differently
    // wherever the app names them.
    const existing = await db.chore.findMany({
      where: { groupId: valid.groupId, archivedAt: null },
      select: { name: true, effortWeight: true, frequency: true },
    });
    if (findDuplicate(existing, valid)) {
      throw new ApiError(409, DUPLICATE_CHORE_MESSAGE);
    }

    let created;
    try {
      created = await db.chore.create({
        data: {
          groupId: valid.groupId,
          name: valid.name,
          effortWeight: valid.effortWeight,
          frequency: valid.frequency,
        },
      });
    } catch (error) {
      // The check above loses its own race when Add is pressed twice quickly,
      // which is the very case it exists for. The unique index doesn't.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ApiError(409, DUPLICATE_CHORE_MESSAGE);
      }
      throw error;
    }

    // Handed out straight away. A chore that has just been added is somebody's
    // job from today, and leaving it unassigned until a separate Rotate press
    // meant it sat there marked "not handed out yet" with nothing to act on —
    // two steps to do the one thing the person plainly meant.
    await rotateChores(valid.groupId, [created.id]);

    revalidatePath(`/groups/${input.groupId}/chores`);
  });
}

export async function rotateChores(groupId: string, onlyChoreIds?: string[]) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const result = await rotateGroup(groupId, onlyChoreIds);
  revalidatePath(`/groups/${groupId}/chores`);
  return result;
}

/**
 * The chore list as it stood, or will stand, on one day.
 *
 * Defaults to today. A chore belongs to a date when its turn overlaps that
 * date — one rule covering all four frequencies, which is what makes a weekly
 * chore appear every day of the week it is due rather than only on the day it
 * happened to be handed out.
 */
export async function listChores(groupId: string, onDate?: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const now = new Date();
  const { timeZone } = await db.group.findUniqueOrThrow({
    where: { id: groupId },
    select: { timeZone: true },
  });
  // An unparseable date in the URL falls back to today rather than erroring:
  // a mistyped link should still show something useful.
  const day =
    (onDate ? dayWindow(onDate, timeZone) : null) ??
    dayWindow(toIsoDate(now, timeZone), timeZone)!;

  const [chores, members, allAssignments] = await Promise.all([
    db.chore.findMany({
      where: { groupId, archivedAt: null },
      include: {
        // So the row can say whether removing it would throw away a record of
        // work already done, before anyone presses the button.
        _count: { select: { assignments: true } },
        // Every turn, not just the newest: the day being asked about may be in
        // the past, and `take: 1` would answer with a turn that had not
        // started yet.
        assignments: {
          orderBy: { periodStart: "desc" },
          include: { user: true },
        },
      },
    }),
    // So somebody who has never been given anything still appears, on zero,
    // rather than vanishing from the fairness panel entirely.
    db.groupMember.findMany({
      where: { groupId, leftAt: null },
      select: { user: { select: { displayName: true } } },
    }),
    // Every assignment ever, not just each chore's current one — the running
    // totals below are cumulative, and `take: 1` above deliberately keeps only
    // the latest. Deliberately unfiltered by archivedAt: retiring a chore must
    // not rewrite the record of who did it while it existed.
    db.choreAssignment.findMany({
      where: { chore: { groupId } },
      select: {
        completedAt: true,
        periodEnd: true,
        user: { select: { displayName: true } },
        chore: { select: { effortWeight: true, frequency: true } },
      },
    }),
  ]);

  // Who a chore came from, when it arrived by swap.
  //
  // Without this the row contradicts itself: the rotation's explanation still
  // names whoever it originally picked, while the chore sits with somebody
  // else. That reads as a bug rather than as two people having agreed a trade.
  // Whose turn each chore is on the day in question — a real one where the
  // records have it, otherwise the rhythm carried forward and marked as
  // nobody's yet.
  const onDay = new Map(
    chores.map((c) => [c.id, occurrenceOn(c, c.assignments, day, timeZone)] as const),
  );

  const currentIds = [...onDay.values()]
    .map((o) => o?.assignment?.id)
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

  // Everyone's running total, by the same rule and the same function the
  // rotation uses — that is the point of it being shared.
  //
  // It counts finished periods, not just what people hold today. Showing only
  // today's chores looked fairer but measured the wrong thing: a daily chore
  // drops off the list tomorrow while a weekly one lingers another six days,
  // so the figures swung on when you happened to look rather than on who had
  // done more. On the live group that read as 357 against 273 when the real
  // totals were 357 against 371 — all but level, with the person shown as
  // under-loaded actually the one slightly ahead.
  //
  // Computed here rather than read from a snapshot stored at rotation time:
  // swaps move chores between people afterwards, and a snapshot doesn't move
  // with them. That is how the panel came to insist a round was "even" when the
  // real split had drifted to 35 against 3.
  const lifetimeLoad = totalLoad(
    allAssignments.map((a) => ({
      key: a.user.displayName,
      completedAt: a.completedAt,
      periodEnd: a.periodEnd,
      effortWeight: a.chore.effortWeight,
      frequency: a.chore.frequency as ChoreFrequency,
    })),
    new Date(),
    members.map((m) => m.user.displayName),
  );

  const roundLoad = [...lifetimeLoad]
    // Shown per week, the same scale the explanation talks in: a weekly 10
    // reads as 10 and a daily 10 as 70. The raw 28-day units are exact but
    // mean nothing to anyone reading the page.
    .map(([name, weighted]) => ({ name, effort: asPerWeek(weighted) }))
    .sort((a, b) => b.effort - a.effort || a.name.localeCompare(b.name));

  return chores
    .filter((c) => onDay.get(c.id))
    .map((c) => {
    const occurrence = onDay.get(c.id) ?? null;
    const current = occurrence?.assignment ?? null;
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
      // The turn this row is about, so it can say "due by Sunday" instead of
      // implying a weekly chore is owed on every day it shows up.
      periodStart: occurrence?.period.start.toISOString() ?? null,
      dueBy: occurrence?.period.end.toISOString() ?? null,
      /** False when the turn is projected: real, but not handed out yet. */
      isAssigned: current !== null,
      /** Why the button is unavailable, worked out once on the server. */
      markDoneBlockedBy: markDoneBlock(current, now),
      // Assignments made before this was structured still hold {steps}; the
      // renderer falls back to those rather than showing nothing.
      explanation: (current?.explanation as ChoreExplanation | undefined) ?? null,
      assignmentId: current?.id ?? null,
      completedAt: current?.completedAt?.toISOString() ?? null,
      hasHistory: c._count.assignments > 0,
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

  // Looking at a future day shows turns that have not begun. The button is
  // hidden there, but the check belongs here too — a disabled button is a
  // suggestion, not a rule, and crediting work for a turn nobody has started
  // would put the person ahead in a rotation that hands the next job to
  // whoever is behind.
  // Unreachable while rotation stamps periodStart with the current moment,
  // and kept anyway: it costs one comparison, and if turns are ever scheduled
  // ahead the alternative is silently crediting work for a turn nobody has
  // started, which moves the person up a rotation that favours whoever is
  // behind. The UI has no matching branch, because a case that cannot happen
  // should not be explained to anyone.
  if (markDoneBlock(assignment, new Date()) === "notStarted") {
    throw new ApiError(400, "That turn hasn't started yet.");
  }

  await db.choreAssignment.update({
    where: { id: assignmentId },
    data: { completedAt: new Date() },
  });

  revalidatePath(`/groups/${assignment.chore.groupId}/chores`);
}

/**
 * Take a chore off the list.
 *
 * Two outcomes, because a chore's history is somebody's record of work done.
 * ChoreAssignment cascades from Chore, so deleting a chore that had ever been
 * done would take its assignments with it and quietly erase the credit for
 * doing them — the person who cleaned the bathroom every week would come out
 * looking like they had done nothing, and the rotation would start handing
 * them more. A chore that was never assigned has no such history, so there is
 * nothing to protect and it goes for good.
 *
 * Either way the chore stops being handed out. Any turn still running is
 * closed off at the moment of removal: nobody has to finish a chore the group
 * has just retired, and an unfinished turn that is over stops counting toward
 * their load by the ordinary rule. Ending the period rather than deleting the
 * row keeps completed work counted and leaves any swap that referenced it
 * intact.
 */
export async function removeChore(
  choreId: string,
): Promise<ActionResult<{ archived: boolean }>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const validId = validate(cuid, choreId);

    const chore = await db.chore.findUniqueOrThrow({
      where: { id: validId },
      include: { _count: { select: { assignments: true } } },
    });
    await assertMember(chore.groupId, session.id);

    if (chore.archivedAt) return { archived: true };

    const now = new Date();
    if (planRemoval(chore._count.assignments) === "delete") {
      await db.chore.delete({ where: { id: chore.id } });
      revalidatePath(`/groups/${chore.groupId}/chores`);
      return { archived: false };
    }

    await db.$transaction([
      db.chore.update({ where: { id: chore.id }, data: { archivedAt: now } }),
      // Closes any turn that is still running. Completed ones are left alone,
      // so finished work goes on counting exactly as it did before.
      db.choreAssignment.updateMany({
        where: { choreId: chore.id, periodEnd: { gt: now }, completedAt: null },
        data: { periodEnd: now },
      }),
    ]);

    revalidatePath(`/groups/${chore.groupId}/chores`);
    return { archived: true };
  });
}

// Effort each member has actually COMPLETED — a narrower question than the
// running total on each chore row, which also counts what people are holding
// right now. Both are worth showing; they just have to be measured the same
// way.
//
// Weighted by frequency and shown per week, like everything else. It counted
// raw effort until now, so the same page carried two different answers to
// "how much have you done": a daily 10 you finished counted as 10 here and as
// 70 in the panel below it.
export async function getChoreFairness(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const { timeZone } = await db.group.findUniqueOrThrow({
    where: { id: groupId },
    select: { timeZone: true },
  });

  const [members, completedAssignments, recentAssignments, liveAssignments] =
    await Promise.all([
    db.groupMember.findMany({ where: { groupId, leftAt: null }, include: { user: true } }),
    db.choreAssignment.findMany({
      where: { chore: { groupId }, completedAt: { not: null } },
      include: { chore: true },
    }),
    // Unfinished turns, for the count of what people let lapse. Restricted to
    // ones already over: a turn still running is not missed, it is in hand.
    db.choreAssignment.findMany({
      where: {
        chore: { groupId },
        completedAt: null,
        periodEnd: { lt: new Date() },
      },
      select: {
        userId: true,
        completedAt: true,
        periodEnd: true,
        chore: {
          select: {
            name: true,
            effortWeight: true,
            frequency: true,
            archivedAt: true,
          },
        },
      },
    }),
    // Turns in hand right now, for the round-by-round progress. Archived
    // chores are left out: a job the group has stopped doing is not something
    // anybody is still part-way through.
    db.choreAssignment.findMany({
      where: {
        chore: { groupId, archivedAt: null },
        periodEnd: { gt: new Date() },
      },
      select: {
        completedAt: true,
        periodStart: true,
        periodEnd: true,
        user: { select: { displayName: true } },
        chore: { select: { effortWeight: true, frequency: true } },
      },
    }),
  ]);

  const effortByUser: Record<string, number> = {};
  members.forEach((m) => (effortByUser[m.userId] = 0));
  completedAssignments.forEach((a) => {
    effortByUser[a.userId] =
      (effortByUser[a.userId] ?? 0) +
      weightedEffort(a.chore.effortWeight, a.chore.frequency as ChoreFrequency);
  });

  const missed = listMissed(
    recentAssignments.map((a) => ({
      key: a.userId,
      completedAt: a.completedAt,
      periodEnd: a.periodEnd,
      choreName: a.chore.name,
      effortWeight: a.chore.effortWeight,
      frequency: a.chore.frequency as ChoreFrequency,
      retired: a.chore.archivedAt !== null,
    })),
    new Date(),
    members.map((m) => m.userId),
    undefined,
    timeZone,
  );

  const progress = periodProgress(
    liveAssignments.map((a) => ({
      key: a.user.displayName,
      frequency: a.chore.frequency as ChoreFrequency,
      effortWeight: a.chore.effortWeight,
      completedAt: a.completedAt,
      periodStart: a.periodStart,
      periodEnd: a.periodEnd,
    })),
    new Date(),
    members.map((m) => m.user.displayName),
  );

  const bars = members.map((m) => ({
    userId: m.userId,
    displayName: m.user.displayName,
    completedEffort: asPerWeek(effortByUser[m.userId] ?? 0),
    missed: missed.get(m.userId) ?? [],
  }));

  return { bars, progress };
}
