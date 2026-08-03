import { db } from "@/lib/db";
import { assignChoresWithTrace } from "@/lib/chore-rotation";
import { weightedEffort, type ChoreFrequency } from "@/lib/chore-weight";
import { totalLoad } from "@/lib/chore-load";
import { periodEndFor } from "@/lib/chore-schedule";

/**
 * Hand out every turn that has run out, for one group.
 *
 * Kept out of the actions file on purpose: everything exported from a
 * "use server" module is a callable endpoint, and this deliberately performs
 * no session or membership check so the nightly cron can use it. Callers are
 * responsible for deciding who is allowed to ask — the action checks
 * membership, the cron route checks the schedule secret.
 */
export async function rotateGroup(groupId: string, onlyChoreIds?: string[]) {
  const [group, chores, members, pastAssignments] = await Promise.all([
    db.group.findUniqueOrThrow({ where: { id: groupId }, select: { timeZone: true } }),
    db.chore.findMany({ where: { groupId } }),
    db.groupMember.findMany({ where: { groupId, leftAt: null }, include: { user: true } }),
    db.choreAssignment.findMany({ where: { chore: { groupId } } }),
  ]);

  const now = new Date();
  // Archived chores stay in `chores` so the running totals below can still
  // look up their weight — dropping them here would lose the credit for work
  // already done on them, which is the whole reason they were kept.
  const needsAssignment = chores.filter((chore) => {
    if (chore.archivedAt) return false;
    // Narrowed when a single new chore is being brought into the rotation, so
    // adding one doesn't quietly re-deal everybody else's lapsed turns as a
    // side effect of pressing Add.
    if (onlyChoreIds && !onlyChoreIds.includes(chore.id)) return false;
    const latest = pastAssignments
      .filter((a) => a.choreId === chore.id)
      .sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime())[0];
    return !latest || latest.periodEnd < now;
  });

  if (needsAssignment.length === 0 || members.length === 0) {
    return { created: 0 };
  }

  // Weighted by how often each chore recurs, and counting work rather than
  // paperwork. Comparing raw effort treated a daily job worth 10 as equal to a
  // weekly job worth 10, when the daily one is seven times the work — so the
  // rotation could pile more onto the person already buried and report the
  // round as balanced. See chore-load for why a missed chore stops counting.
  const cumulative = Object.fromEntries(
    totalLoad(
      pastAssignments.flatMap((a) => {
        const chore = chores.find((c) => c.id === a.choreId);
        return chore
          ? [
              {
                key: a.userId,
                completedAt: a.completedAt,
                periodEnd: a.periodEnd,
                effortWeight: chore.effortWeight,
                frequency: chore.frequency as ChoreFrequency,
              },
            ]
          : [];
      }),
      now,
      members.map((m) => m.userId),
    ),
  );

  const traces = assignChoresWithTrace(
    needsAssignment.map((c) => ({
      id: c.id,
      effortWeight: weightedEffort(c.effortWeight, c.frequency as ChoreFrequency),
    })),
    members.map((m) => ({ userId: m.userId, cumulativeEffort: cumulative[m.userId] ?? 0 })),
  );

  const nameOf = (id: string) =>
    members.find((m) => m.userId === id)?.user.displayName ?? id;

  await Promise.all(
    needsAssignment.map((chore) => {
      const trace = traces[chore.id];
      // Ends on a day boundary, so a turn covers whole calendar days rather
      // than N×24 hours from whenever this button was pressed.
      const periodEnd = periodEndFor(
        now,
        chore.frequency as ChoreFrequency,
        group.timeZone,
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
            // Recorded so the reasoning can say why a daily chore outweighed
            // a weekly one, rather than leaving the numbers unexplained.
            frequency: chore.frequency,
            weightedEffort: weightedEffort(
              chore.effortWeight,
              chore.frequency as ChoreFrequency,
            ),
            assigneeName: nameOf(trace.userId),
            effortBefore: trace.effortBefore,
            // Everyone's standing at that moment, so "they had the least" can
            // be checked rather than taken on trust.
            loadsBefore: trace.loadsBefore.map((l) => ({
              name: nameOf(l.userId),
              effort: l.effort,
            })),
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

  return { created: needsAssignment.length };
}

/**
 * Roll every group's lapsed turns over, without anybody pressing anything.
 *
 * Reuses the same rotation the button does rather than a second copy of the
 * fairness logic — a scheduled path that assigned chores by different rules
 * than the visible one would be the worst possible place for the two to
 * disagree.
 *
 * No session here, so no membership check is possible; the route in front of
 * this verifies the cron secret instead.
 */
export async function rotateLapsedChores() {
  const groups = await db.group.findMany({ select: { id: true } });

  let assigned = 0;
  const failed: string[] = [];

  for (const group of groups) {
    try {
      const result = await rotateGroup(group.id);
      assigned += result.created;
    } catch {
      // One group's bad data must not stop every other house getting its
      // chores handed out.
      failed.push(group.id);
    }
  }

  return { groups: groups.length, assigned, failed: failed.length };
}
