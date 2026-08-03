/** What taking a chore off the list should actually do to it. */
export type RemovalPlan = "delete" | "retire";

/**
 * Whether a chore can be deleted outright or has to be retired instead.
 *
 * ChoreAssignment cascades from Chore, so deleting a chore that had ever been
 * handed out would take its assignments with it — and those assignments are
 * the record of who did the work. Someone who cleaned the bathroom every week
 * for a month would suddenly read as having done nothing, and the rotation,
 * which hands the next chore to whoever is behind, would start piling more on
 * them. Tidying up the list would quietly punish the person pulling their
 * weight.
 *
 * A chore nobody was ever given has no such record, so keeping a hidden row
 * around buys nothing and it goes for good.
 */
export function planRemoval(assignmentCount: number): RemovalPlan {
  return assignmentCount === 0 ? "delete" : "retire";
}
