export type MemberCompletedEffort = { userId: string; displayName: string; completedEffort: number };
export type FairnessBar = MemberCompletedEffort & { barPercent: number };

// Scales each member's completed effort relative to whoever's done the
// most, so the bar chart reads as "how does this compare to my roommates"
// rather than a raw, hard-to-interpret number. When nobody's completed
// anything yet, every bar is empty rather than dividing by zero.
export function computeFairnessBars(members: MemberCompletedEffort[]): FairnessBar[] {
  const max = Math.max(0, ...members.map((m) => m.completedEffort));
  return members.map((m) => ({
    ...m,
    barPercent: max > 0 ? Math.round((m.completedEffort / max) * 100) : 0,
  }));
}
