export type ChoreIdentity = {
  name: string;
  effortWeight: number;
  frequency: string;
};

/**
 * The form of a name that decides whether two chores are the same one.
 *
 * Case and stray spacing are how the same chore gets typed twice — "Dishes"
 * after "dishes ", a trailing space from a paste. Nobody reading the list
 * would call those two different jobs.
 */
export function normaliseChoreName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Whether two chores are indistinguishable to somebody reading the app.
 *
 * The test is deliberately the same information the UI shows when it names a
 * chore — the name, how heavy it is, how often it comes round. Two chores that
 * differ in any of those can be told apart on screen and are allowed: a daily
 * "kitchen" and a weekly one are a reasonable pair, and they read as
 * "kitchen (easy, daily)" and "kitchen (hard, weekly)".
 *
 * Matching on all three is the point. A rule of "no repeated names" would
 * block that legitimate pair; this blocks only what nothing in the interface
 * could ever separate.
 */
export function isSameChore(a: ChoreIdentity, b: ChoreIdentity): boolean {
  return (
    normaliseChoreName(a.name) === normaliseChoreName(b.name) &&
    a.effortWeight === b.effortWeight &&
    a.frequency === b.frequency
  );
}

/**
 * The existing chore a new one would be a copy of, if there is one.
 *
 * Two of these in a group is always a mistake — most often a double-tap on
 * Add, which is how the live group ended up with two identical "kill cat"
 * chores a minute apart. There is no way to tell them apart afterwards, so a
 * swap offer naming one of them is ambiguous, and the rotation hands out twice
 * the work somebody thought they were creating.
 */
export function findDuplicate<T extends ChoreIdentity>(
  existing: T[],
  candidate: ChoreIdentity,
): T | undefined {
  return existing.find((chore) => isSameChore(chore, candidate));
}
