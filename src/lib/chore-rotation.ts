export type ChoreLoad = { id: string; effortWeight: number };
export type MemberLoad = { userId: string; cumulativeEffort: number };

/** What an assignment can honestly say about itself afterwards. */
export type AssignmentTrace = {
  userId: string;
  /** The assignee's load at the moment this chore was handed out. */
  effortBefore: number;
  /** Everyone's load once the whole round is dealt, so the split is visible. */
  roundTotals: { userId: string; effort: number }[];
  /** Nobody had any history — this was an opening split, not a catch-up. */
  firstRound: boolean;
};

// Heaviest chores are assigned first, each going to whoever currently has
// the least cumulative effort — so nobody stays stuck with the worst jobs
// over time, even as chores of different weights come and go.
//
// The trace exists because the reason matters as much as the result. People
// argue about chores, and "you were picked because you had the least so far"
// only settles it if the number quoted is the one the rotation actually saw.
export function assignChoresWithTrace(
  chores: ChoreLoad[],
  members: MemberLoad[],
): Record<string, AssignmentTrace> {
  if (members.length === 0) return {};

  const loads = members.map((m) => ({ ...m }));
  const sortedChores = [...chores].sort((a, b) => b.effortWeight - a.effortWeight);
  // Everyone level means there was nothing to catch up on, so the round was an
  // opening split. Saying that outright stops the first assignment reading as
  // though somebody had been slacking.
  const firstRound = members.every((m) => m.cumulativeEffort === 0);

  const picked: { choreId: string; userId: string; effortBefore: number }[] = [];

  for (const chore of sortedChores) {
    loads.sort(
      (a, b) =>
        a.cumulativeEffort - b.cumulativeEffort || a.userId.localeCompare(b.userId),
    );
    const chosen = loads[0];
    // Captured before the increment. Reporting the pre-round figure instead is
    // how an assignment came to claim someone "had the lowest effort (0)" when
    // the rotation had already handed them a job moments earlier.
    picked.push({
      choreId: chore.id,
      userId: chosen.userId,
      effortBefore: chosen.cumulativeEffort,
    });
    chosen.cumulativeEffort += chore.effortWeight;
  }

  const roundTotals = loads
    .map((l) => ({ userId: l.userId, effort: l.cumulativeEffort }))
    .sort((a, b) => b.effort - a.effort || a.userId.localeCompare(b.userId));

  return Object.fromEntries(
    picked.map((p) => [
      p.choreId,
      { userId: p.userId, effortBefore: p.effortBefore, roundTotals, firstRound },
    ]),
  );
}

/** Just who gets what, for callers that don't need the reasoning. */
export function assignChoresForPeriod(
  chores: ChoreLoad[],
  members: MemberLoad[],
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(assignChoresWithTrace(chores, members)).map(([choreId, trace]) => [
      choreId,
      trace.userId,
    ]),
  );
}
