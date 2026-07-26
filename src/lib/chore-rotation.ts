export type ChoreLoad = { id: string; effortWeight: number };
export type MemberLoad = { userId: string; cumulativeEffort: number };

// Heaviest chores are assigned first, each going to whoever currently has
// the least cumulative effort — so nobody stays stuck with the worst jobs
// over time, even as chores of different weights come and go.
export function assignChoresForPeriod(
  chores: ChoreLoad[],
  members: MemberLoad[],
): Record<string, string> {
  if (members.length === 0) return {};

  const loads = members.map((m) => ({ ...m }));
  const sortedChores = [...chores].sort((a, b) => b.effortWeight - a.effortWeight);
  const assignments: Record<string, string> = {};

  for (const chore of sortedChores) {
    loads.sort(
      (a, b) =>
        a.cumulativeEffort - b.cumulativeEffort || a.userId.localeCompare(b.userId),
    );
    const chosen = loads[0];
    assignments[chore.id] = chosen.userId;
    chosen.cumulativeEffort += chore.effortWeight;
  }

  return assignments;
}
