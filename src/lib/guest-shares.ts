// A guest is someone without an account who was part of one expense — the
// friend who came to dinner. They're an extra mouth at the table, so they
// count as a head in the split, but they can't be settled with through the
// group ledger because they have no account to owe from.
//
// So a guest's share sits in one of two places, and never both:
//
//   PAID      the guest has actually paid the person who fronted the money.
//             Their share leaves the group's books entirely — the payer is
//             out that much less, and nobody in the group covers it.
//
//   anything  the guest hasn't paid (yet, or won't). Their share is absorbed
//   else      by their hosts — the members who brought them — because those
//             are the people who'd be out of pocket in real life.
//
// PAID is the trigger rather than PAYING on purpose: PAYING is an intention,
// and if the guest then flakes, the group's balances would have to be
// reversed after people had already seen them. Only money that has actually
// moved is allowed to move the ledger.

export type GuestStatus = "UNDECIDED" | "PAYING" | "PAID" | "DECLINED";

export type GuestShareInput = {
  id: string;
  status: GuestStatus;
  /** Members who brought this guest, and who cover their share if unpaid. */
  hostIds: string[];
};

export type ItemShareResult = {
  /** What each member owes for this item, hosting duty included. */
  memberCents: Record<string, number>;
  /**
   * Each guest's portion of the bill — always their share of it, whatever
   * they've answered. This is the number to show the guest ("your share is
   * 50"); whether they're the one on the hook for it is what `status` says.
   */
  guestShareCents: Record<string, number>;
  /**
   * Per guest, how much of their share each host is carrying. Empty for a
   * guest who paid their own way.
   *
   * This is what makes it possible to pay the hosts back directly: once the
   * hosts have settled up, they — not whoever originally fronted the bill —
   * are the people actually out of pocket for this guest.
   */
  guestHostSplit: Record<string, Record<string, number>>;
  /**
   * The part of the item the group is accountable for — the item total minus
   * anything a guest has already paid directly. This, not the raw total, is
   * what the payer should be credited in the group ledger.
   */
  groupTotalCents: number;
};

// Splits cents as evenly as integers allow, handing the leftover pennies out
// one each rather than dumping them all on one person. Sorted so the same
// input always produces the same allocation regardless of what order the
// database happened to return rows in.
function allocateEvenly(totalCents: number, ids: string[]): Record<string, number> {
  if (ids.length === 0) throw new Error("Cannot allocate cents to nobody.");
  if (totalCents < 0) throw new Error("Cannot allocate a negative amount.");

  const ordered = [...ids].sort();
  const base = Math.floor(totalCents / ordered.length);
  let remainder = totalCents - base * ordered.length;

  const out: Record<string, number> = {};
  for (const id of ordered) {
    out[id] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
  }
  return out;
}

// Guests only apply to an equally-split item. A custom split is a statement
// about exact amounts each named person agreed to, and there's no honest way
// to wedge an extra head into it — so the caller must reject that combination
// before getting here.
export function deriveItemShares({
  totalCents,
  memberIds,
  guests,
}: {
  totalCents: number;
  memberIds: string[];
  guests: GuestShareInput[];
}): ItemShareResult {
  if (memberIds.length === 0) {
    throw new Error("An item needs at least one member participant.");
  }

  const memberSet = new Set(memberIds);
  for (const guest of guests) {
    // Ids come from different tables so this shouldn't be reachable, but a
    // collision would silently overwrite someone's share with someone else's.
    if (memberSet.has(guest.id)) {
      throw new Error(`Guest id ${guest.id} collides with a member id.`);
    }
  }

  const perHead = allocateEvenly(totalCents, [
    ...memberIds,
    ...guests.map((g) => g.id),
  ]);

  const memberCents: Record<string, number> = {};
  for (const id of memberIds) memberCents[id] = perHead[id];

  const guestShareCents: Record<string, number> = {};
  const guestHostSplit: Record<string, Record<string, number>> = {};

  for (const guest of guests) {
    const owed = perHead[guest.id];
    guestShareCents[guest.id] = owed;
    guestHostSplit[guest.id] = {};

    // Paid means the money already reached the payer directly, so it never
    // touches the group's books and no member picks it up.
    if (guest.status === "PAID") continue;

    // A guest whose hosts have since left the split would otherwise strand
    // their share with nobody to carry it, and those cents would vanish from
    // a total that must stay exact. The whole table picks it up instead.
    const hosts = guest.hostIds.filter((id) => memberSet.has(id));
    const absorbers = hosts.length > 0 ? hosts : memberIds;
    const carried = allocateEvenly(owed, absorbers);

    guestHostSplit[guest.id] = carried;
    for (const [id, cents] of Object.entries(carried)) {
      memberCents[id] += cents;
    }
  }

  const groupTotalCents = Object.values(memberCents).reduce((a, b) => a + b, 0);

  return { memberCents, guestShareCents, guestHostSplit, groupTotalCents };
}

// Once a guest has committed money against a quoted amount, that amount can't
// change underneath them. PAYING counts as well as PAID: the guest has been
// shown a figure and is off to send it, and re-splitting the bill mid-transfer
// means they pay the wrong amount with no way to know.
//
// This is the lock, and it's derived rather than stored — a boolean column
// would be one more thing that can drift out of step with the guests it
// describes.
export function guestLockReason(statuses: GuestStatus[]): "PAYING" | "PAID" | null {
  if (statuses.includes("PAID")) return "PAID";
  if (statuses.includes("PAYING")) return "PAYING";
  return null;
}

// The settlement engine works in ratios, not cents (see
// ExpenseItemParticipant.shareRatio), so hand it back ratios of the amount
// the group is actually accountable for.
export function toShareRatios(
  memberCents: Record<string, number>,
  groupTotalCents: number,
): Record<string, number> {
  if (groupTotalCents === 0) {
    // Every head was a guest who paid their own way. Nobody owes anything,
    // but the ratios still have to sum to 1 or the item validation rejects it.
    const ids = Object.keys(memberCents);
    return Object.fromEntries(ids.map((id) => [id, 1 / ids.length]));
  }
  return Object.fromEntries(
    Object.entries(memberCents).map(([id, cents]) => [id, cents / groupTotalCents]),
  );
}
