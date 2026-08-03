/** What to do when the email we're signing in with already belongs to a row. */
export type AdoptionDecision =
  /** Same person, new Clerk identity — move the account across. */
  | "adopt"
  /** Unproven email. Refuse: adopting here would hand over someone else's data. */
  | "refuseUnverified"
  /** Nothing owns this email, so the conflict was about something else. */
  | "notOurs";

/**
 * Whether a sign-in may take over the account that already holds this email.
 *
 * Accounts are keyed on Clerk's user id, but a person can arrive with a new
 * one: signing in through a second OAuth provider, deleting and recreating
 * their login, or the app moving to a different Clerk instance. Their email is
 * unchanged, so the insert collides with the unique index on it. Without this
 * the collision surfaced as a 500 and the account became unreachable — the
 * data sitting there, correct, with no way back into it.
 *
 * Adoption is gated on Clerk having verified the address, and that gate is the
 * whole security of it. Proving you control an email is what makes you its
 * owner; without the check, signing up with somebody else's address would
 * inherit their expenses, debts and group memberships.
 */
export function decideAdoption(params: {
  /** Clerk id on the row that currently owns the email, or null if none does. */
  ownerClerkId: string | null;
  incomingClerkId: string;
  emailVerified: boolean;
}): AdoptionDecision {
  const { ownerClerkId, incomingClerkId, emailVerified } = params;

  if (ownerClerkId === null) return "notOurs";
  // Already ours. Re-pointing it is a no-op, and refusing would strand a
  // session that has every right to exist.
  if (ownerClerkId === incomingClerkId) return "adopt";
  return emailVerified ? "adopt" : "refuseUnverified";
}
