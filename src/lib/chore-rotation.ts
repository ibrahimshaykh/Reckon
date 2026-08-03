export type ChoreLoad = {
  id: string;
  effortWeight: number;
  /**
   * Who let this same chore lapse last time, and should not simply be handed
   * it again.
   *
   * Missing a turn costs credit, which drops somebody down the order and makes
   * the rotation MORE likely to pick them — so a chore nobody is doing kept
   * going back to the person not doing it. Fair by the numbers, and the bins
   * still never went out.
   *
   * Passing over them for one round separates two questions the rotation had
   * merged: who owes work, and who gets this particular job. They still owe —
   * their total dropped, so other chores come their way — but this one goes to
   * somebody who might actually do it.
   */
  excludeUserIds?: string[];
};
export type MemberLoad = { userId: string; cumulativeEffort: number };

/** What an assignment can honestly say about itself afterwards. */
export type AssignmentTrace = {
  userId: string;
  /** The assignee's load at the moment this chore was handed out. */
  effortBefore: number;
  /**
   * Where everyone stood at that same moment, lightest first.
   *
   * "They had the least" can't be checked without seeing what everyone else
   * had. On its own the assignee's figure is a bare number with nothing to
   * measure it against — which is what made the reasoning read as an assertion
   * rather than an argument.
   */
  loadsBefore: { userId: string; effort: number }[];
  /** Everyone's load once the whole round is dealt, so the split is visible. */
  roundTotals: { userId: string; effort: number }[];
  /** Nobody had any history — this was an opening split, not a catch-up. */
  firstRound: boolean;
  /** Passed over for this chore because they let the last turn lapse. */
  skippedUserIds: string[];
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

  const picked: {
    choreId: string;
    userId: string;
    effortBefore: number;
    loadsBefore: { userId: string; effort: number }[];
    skippedUserIds: string[];
  }[] = [];

  for (const chore of sortedChores) {
    loads.sort(
      (a, b) =>
        a.cumulativeEffort - b.cumulativeEffort || a.userId.localeCompare(b.userId),
    );
    // Whoever dropped this chore last time is passed over, unless that would
    // leave nobody to give it to — a one-person household still has to do it.
    const excluded = chore.excludeUserIds ?? [];
    const eligible = loads.filter((l) => !excluded.includes(l.userId));
    const chosen = eligible.length > 0 ? eligible[0] : loads[0];
    const skippedUserIds =
      eligible.length > 0
        ? loads.filter((l) => excluded.includes(l.userId)).map((l) => l.userId)
        : [];
    // Captured before the increment. Reporting the pre-round figure instead is
    // how an assignment came to claim someone "had the lowest effort (0)" when
    // the rotation had already handed them a job moments earlier.
    picked.push({
      choreId: chore.id,
      userId: chosen.userId,
      effortBefore: chosen.cumulativeEffort,
      // Copied, not referenced — `loads` keeps mutating as the round is dealt,
      // and a live reference would leave every chore quoting the final totals
      // as though they were the ones it saw.
      loadsBefore: loads.map((l) => ({ userId: l.userId, effort: l.cumulativeEffort })),
      skippedUserIds,
    });
    chosen.cumulativeEffort += chore.effortWeight;
  }

  const roundTotals = loads
    .map((l) => ({ userId: l.userId, effort: l.cumulativeEffort }))
    .sort((a, b) => b.effort - a.effort || a.userId.localeCompare(b.userId));

  return Object.fromEntries(
    picked.map((p) => [
      p.choreId,
      {
        userId: p.userId,
        effortBefore: p.effortBefore,
        loadsBefore: p.loadsBefore,
        skippedUserIds: p.skippedUserIds,
        roundTotals,
        firstRound,
      },
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
