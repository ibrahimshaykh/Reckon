"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, generateGuestToken } from "@/lib/dal";
import { assertMember } from "@/lib/actions/groups";
import { ApiError } from "@/lib/api-error";
import { toCents } from "@/lib/money";
import { validate, cuid, shortText } from "@/lib/validation";
import { deriveItemShares, guestLockReason } from "@/lib/guest-shares";
import { recalculateSettlements } from "@/lib/actions/settlements";
import { asActionResult, type ActionResult } from "@/lib/action-result";
import type { GuestStatus } from "@/generated/prisma/client";

const GUEST_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const addGuestSchema = z.object({
  expenseId: cuid,
  name: shortText("Name", 100),
  email: z.string().trim().email().optional().or(z.literal("")),
  hostIds: z.array(cuid).min(1, "Pick who's covering this guest."),
});

// Loads an expense for a guest write, checking the caller is allowed to touch
// it and that the expense is in a shape a guest can be added to at all.
async function loadEditableExpense(expenseId: string, userId: string) {
  const expense = await db.expense.findUniqueOrThrow({
    where: { id: expenseId },
    include: {
      items: { include: { participants: true } },
      guests: true,
    },
  });

  await assertMember(expense.groupId, userId);
  return expense;
}

export async function addGuest(input: {
  expenseId: string;
  name: string;
  email?: string;
  hostIds: string[];
}): Promise<ActionResult<{ url: string }>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const valid = validate(addGuestSchema, input);
    const expense = await loadEditableExpense(valid.expenseId, session.id);

    // A scanned receipt records who claimed which line, and a custom split
    // records exact amounts people agreed to. Neither has a defensible answer
    // for "and one more person" — the guest would have to be given someone
    // else's items or someone else's agreed figure.
    if (expense.items.length !== 1 || expense.items[0].splitType !== "EQUAL") {
      throw new ApiError(
        400,
        "Guests can only be added to an evenly split expense. This one has itemised or custom amounts.",
      );
    }

    const lock = guestLockReason(expense.guests.map((g) => g.status));
    if (lock) {
      throw new ApiError(
        400,
        "Someone's already paying their share of this expense, so adding another guest would change what they were asked for.",
      );
    }

    const participantIds = new Set(expense.items[0].participants.map((p) => p.userId));
    const strangers = valid.hostIds.filter((id) => !participantIds.has(id));
    if (strangers.length > 0) {
      throw new ApiError(
        400,
        "A guest can only be covered by someone who's part of this expense.",
      );
    }

    const token = generateGuestToken();

    await db.expenseGuest.create({
      data: {
        token,
        expenseId: valid.expenseId,
        name: valid.name,
        email: valid.email || undefined,
        expiresAt: new Date(Date.now() + GUEST_LINK_TTL_MS),
        hosts: { create: valid.hostIds.map((userId) => ({ userId })) },
      },
    });

    // The guest is a head in the split from this moment, so what everyone
    // owes has genuinely changed.
    await recalculateSettlements(expense.groupId);
    revalidatePath(`/groups/${expense.groupId}`);
    revalidatePath(`/groups/${expense.groupId}/settle`);

    return { url: `/guest/${token}` };
  });
}

export async function removeGuest(guestId: string): Promise<ActionResult<void>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const validId = validate(cuid, guestId);

    const guest = await db.expenseGuest.findUniqueOrThrow({
      where: { id: validId },
      include: { expense: { select: { groupId: true } } },
    });
    await assertMember(guest.expense.groupId, session.id);

    // Removing a guest who already paid would leave their money unaccounted
    // for — it reached the payer but no longer maps to anything. SENT counts
    // too: the money is in flight, and deleting the row it belongs to means it
    // arrives against nothing.
    if (
      guest.status === "PAID" ||
      guest.status === "SENT" ||
      guest.status === "PAYING"
    ) {
      throw new ApiError(
        400,
        `${guest.name} is already paying their share, so they can't be removed. Delete the whole expense if it's wrong.`,
      );
    }

    await db.expenseGuest.delete({ where: { id: guest.id } });

    await recalculateSettlements(guest.expense.groupId);
    revalidatePath(`/groups/${guest.expense.groupId}`);
    revalidatePath(`/groups/${guest.expense.groupId}/settle`);
  });
}

const setHostsSchema = z.object({
  guestId: cuid,
  hostIds: z.array(cuid).min(1, "Pick who's covering this guest."),
});

// Changing who covers a guest. Deliberately allowed even while the expense is
// locked: a guest's share is the bill divided by heads, so it doesn't depend
// on who's carrying it. Moving that weight between members changes what they
// owe each other, never what the guest was quoted.
export async function setGuestHosts(input: {
  guestId: string;
  hostIds: string[];
}): Promise<ActionResult<void>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const valid = validate(setHostsSchema, input);

    const guest = await db.expenseGuest.findUniqueOrThrow({
      where: { id: valid.guestId },
      include: {
        expense: {
          select: {
            groupId: true,
            items: { select: { participants: { select: { userId: true } } } },
          },
        },
      },
    });
    await assertMember(guest.expense.groupId, session.id);

    const participantIds = new Set(
      guest.expense.items.flatMap((i) => i.participants.map((p) => p.userId)),
    );
    if (valid.hostIds.some((id) => !participantIds.has(id))) {
      throw new ApiError(
        400,
        "A guest can only be covered by someone who's part of this expense.",
      );
    }

    await db.$transaction([
      db.expenseGuestHost.deleteMany({ where: { guestId: guest.id } }),
      db.expenseGuest.update({
        where: { id: guest.id },
        data: {
          // Somebody has now actually chosen, so stop hedging in the UI.
          hostsAssumed: false,
          hosts: { create: valid.hostIds.map((userId) => ({ userId })) },
        },
      }),
    ]);

    await recalculateSettlements(guest.expense.groupId);
    revalidatePath(`/groups/${guest.expense.groupId}`);
    revalidatePath(`/groups/${guest.expense.groupId}/settle`);
  });
}

// Guest links die after 30 days, and a guest who takes longer than that then
// has no way back in — the link 404s and there was nothing anyone could do
// about it. This hands the host a working link again, keeping the same token
// so a copy already sitting in someone's chat starts working too.
export async function refreshGuestLink(
  guestId: string,
): Promise<ActionResult<{ url: string }>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const validId = validate(cuid, guestId);

    const guest = await db.expenseGuest.findUniqueOrThrow({
      where: { id: validId },
      include: { expense: { select: { groupId: true } } },
    });
    await assertMember(guest.expense.groupId, session.id);

    const refreshed = await db.expenseGuest.update({
      where: { id: guest.id },
      data: { expiresAt: new Date(Date.now() + GUEST_LINK_TTL_MS) },
    });

    return { url: `/guest/${refreshed.token}` };
  });
}

// Every method a person can save, not a subset of them. PayPal and Cash App
// were missing here while the settings page happily collected both, so a payer
// could fill them in, see them stored, and guests would still be told there
// was no way to pay them.
export type GuestPayTo = {
  venmoHandle: string | null;
  paypalHandle: string | null;
  cashappHandle: string | null;
  easypaisaNumber: string | null;
  jazzcashNumber: string | null;
  nayapayHandle: string | null;
  bankDetails: string | null;
};

/**
 * A host, for naming only.
 *
 * Their payment details used to travel with the link, because the guest was
 * asked to pay each host directly. They pay whoever fronted the bill now, so
 * the details are not needed — and a link handed to somebody outside the group
 * should carry the smallest amount of other people's banking information it
 * can, which is none.
 */
export type GuestHost = {
  name: string;
  /** How much of this guest's share this host is carrying. */
  amountCents: number;
};

export type GuestView = {
  guestName: string;
  status: GuestStatus;
  expenseTitle: string;
  payerName: string;
  currency: string;
  /** Only this guest's share — never the whole bill, never anyone else's. */
  shareCents: number;
  /**
   * Populated only once the guest has said they'll pay. Before that there's
   * nothing to pay to, and the payer's handles aren't the link holder's
   * business.
   */
  payTo: GuestPayTo | null;
  /**
   * The hosts have already settled up, so this guest's share has been paid
   * for. The link stops asking them for money — a guest is a guest — but
   * doesn't refuse it, because insisting on paying is their call to make.
   */
  covered: boolean;
  /**
   * Who's carrying this guest's share, and how much each. Once `covered` is
   * true these are the people to pay, not the person who fronted the bill:
   * the payer has been made whole, and the hosts are the ones out of pocket.
   */
  hosts: GuestHost[];
  /**
   * The receipt, once the payer has confirmed the money arrived. Read from the
   * frozen column rather than recomputed, so it still says what was actually
   * handed over even if the bill is edited afterwards.
   */
  paidAmountCents: number | null;
  paidAt: string | null;
};

function toPayTo(payer: GuestPayTo): GuestPayTo {
  return {
    venmoHandle: payer.venmoHandle,
    paypalHandle: payer.paypalHandle,
    cashappHandle: payer.cashappHandle,
    easypaisaNumber: payer.easypaisaNumber,
    jazzcashNumber: payer.jazzcashNumber,
    nayapayHandle: payer.nayapayHandle,
    bankDetails: payer.bankDetails,
  };
}

// Public read — the token is the whole credential, same trust model as a
// settlement confirm link. Deliberately narrow: a guest sees their own share
// and who to pay, and nothing about what the rest of the group owes.
export async function getGuestView(token: string): Promise<GuestView | null> {
  const guest = await db.expenseGuest.findUnique({
    where: { token },
    include: {
      hosts: { include: { user: true } },
      expense: {
        include: {
          paidBy: true,
          group: true,
          items: { include: { participants: true } },
          guests: { include: { hosts: true } },
        },
      },
    },
  });

  if (!guest || guest.expiresAt < new Date()) return null;

  const { expense } = guest;
  const item = expense.items[0];
  if (!item) return null;

  const { guestShareCents, guestHostSplit } = deriveItemShares({
    totalCents: toCents(item.amount),
    memberIds: item.participants.map((p) => p.userId),
    guests: expense.guests.map((g) => ({
      id: g.id,
      status: g.status,
      hostIds: g.hosts.map((h) => h.userId),
    })),
  });

  const payer = expense.paidBy;
  const committed =
    guest.status === "PAYING" ||
    guest.status === "SENT" ||
    guest.status === "PAID";

  const settled = await hostsHaveSettled(
    expense.groupId,
    guest.hosts.map((h) => h.userId),
  );
  const covered = guest.status !== "PAID" && settled;

  const carried = guestHostSplit[guest.id] ?? {};

  return {
    guestName: guest.name,
    status: guest.status,
    expenseTitle: expense.title,
    payerName: payer.displayName,
    currency: expense.group.currency,
    shareCents: guestShareCents[guest.id] ?? 0,
    payTo: committed ? toPayTo(payer) : null,
    covered,
    hosts: guest.hosts.map((h) => ({
      name: h.user.displayName,
      amountCents: carried[h.userId] ?? 0,
    })),
    // Falls back to the live share for guests confirmed before the frozen
    // column existed, so their receipt still shows a figure rather than a gap.
    paidAmountCents:
      guest.status === "PAID"
        ? guest.paidAmount !== null
          ? toCents(guest.paidAmount)
          : (guestShareCents[guest.id] ?? 0)
        : null,
    paidAt:
      guest.status === "PAID" && guest.resolvedAt
        ? guest.resolvedAt.toISOString()
        : null,
  };
}

/**
 * Have this guest's hosts squared up between themselves?
 *
 * If they have, the guest's share has already been paid for — by the hosts,
 * out of their own pockets — and nobody is waiting on the guest for it any
 * more. That is what makes a guest "covered".
 *
 * Two conditions, and both are needed. Nothing involving the hosts is still
 * outstanding, AND money of theirs actually moved. Without the second half, a
 * host who is also the payer can owe nobody and have no rows at all, and that
 * emptiness would read as "already covered" while they are still out of
 * pocket.
 *
 * The second half reads the Payment table rather than settlement statuses,
 * because a cleared settlement row is deleted — counting CONFIRMED rows would
 * report zero at exactly the moment the money had definitely arrived.
 *
 * Shared rather than written twice. The guest's own link and the settle page
 * were answering this question separately, and disagreeing: the link told a
 * guest their share was covered while the settle page was still listing them
 * as owing it.
 */
export async function hostsHaveSettled(
  groupId: string,
  hostIds: string[],
): Promise<boolean> {
  if (hostIds.length === 0) return false;

  const hostSides = [{ fromUserId: { in: hostIds } }, { toUserId: { in: hostIds } }];
  const [outstanding, paid] = await Promise.all([
    db.settlement.count({
      where: { groupId, status: { not: "CONFIRMED" }, OR: hostSides },
    }),
    db.payment.count({ where: { groupId, OR: hostSides } }),
  ]);

  return outstanding === 0 && paid > 0;
}

export type OutstandingGuest = {
  id: string;
  name: string;
  status: GuestStatus;
  expenseTitle: string;
  shareCents: number;
  /** Members carrying this share until the guest actually pays. */
  hostNames: string[];
};

/**
 * Guests who still owe money, for the settle page.
 *
 * They cannot appear in the ledger above it: that computes the fewest
 * payments between *accounts*, and a guest has no account to pay from. Their
 * share is instead carried by their hosts, which is correct but invisible —
 * the group could see Lola owing more without anything on the page explaining
 * that a guest of hers is the reason. This is that explanation.
 *
 * Only guests whose share is still an open question appear: undecided, paying,
 * or claiming to have sent it. Those are the ones where money might yet move.
 *
 * PAID and DECLINED are both settled questions, so both are left out. A paid
 * guest's money has arrived and their share is off the books. A guest who
 * declined is never going to pay — their share has become part of what the
 * members owe each other, and it is already counted in the figures above.
 * Listing either one implies there is something left to chase, on a page whose
 * whole job is to say what is left to chase. The detail lives on the expense,
 * which is where "why was this bill split like this" belongs.
 */
export async function listOutstandingGuests(
  groupId: string,
): Promise<OutstandingGuest[]> {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const OPEN: GuestStatus[] = ["UNDECIDED", "PAYING", "SENT"];

  const expenses = await db.expense.findMany({
    where: { groupId, guests: { some: { status: { in: OPEN } } } },
    include: {
      items: { include: { participants: true } },
      guests: { include: { hosts: { include: { user: true } } } },
    },
  });

  const out: OutstandingGuest[] = [];

  for (const expense of expenses) {
    const item = expense.items[0];
    if (!item) continue;

    const { guestShareCents } = deriveItemShares({
      totalCents: toCents(item.amount),
      memberIds: item.participants.map((p) => p.userId),
      guests: expense.guests.map((g) => ({
        id: g.id,
        status: g.status,
        hostIds: g.hosts.map((h) => h.userId),
      })),
    });

    for (const guest of expense.guests) {
      if (!OPEN.includes(guest.status)) continue;

      // Their hosts have squared up, so this share has already been paid for
      // out of their pockets and nobody is waiting on the guest for it. Listing
      // it here said the opposite of what the group could see for itself —
      // "Everyone's settled up" at the top of the page, and a guest still
      // apparently owing four thousand rupees underneath it.
      if (await hostsHaveSettled(groupId, guest.hosts.map((h) => h.userId))) {
        continue;
      }

      out.push({
        id: guest.id,
        name: guest.name,
        status: guest.status,
        expenseTitle: expense.title,
        shareCents: guestShareCents[guest.id] ?? 0,
        hostNames: guest.hosts.map((h) => h.user.displayName),
      });
    }
  }

  // Whoever has said the most comes first: someone claiming to have sent money
  // needs looking at today, someone who hasn't answered needs chasing whenever.
  const rank: Record<string, number> = {
    SENT: 0,
    PAYING: 1,
    UNDECIDED: 2,
  };
  return out.sort(
    (a, b) =>
      (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
      b.shareCents - a.shareCents ||
      a.name.localeCompare(b.name),
  );
}

const respondSchema = z.object({
  token: z.string().min(1),
  choice: z.enum(["PAYING", "DECLINED"]),
});

// The guest's own answer. They can say they'll pay or that they're out —
// they can't mark themselves PAID, because that's an assertion about money
// the payer hasn't seen. Only the payer confirms receipt.
export async function respondAsGuest(input: {
  token: string;
  choice: "PAYING" | "DECLINED";
}): Promise<ActionResult<{ status: GuestStatus; payTo: GuestPayTo | null }>> {
  return asActionResult(async () => {
    const valid = validate(respondSchema, input);

    const guest = await db.expenseGuest.findUnique({
      where: { token: valid.token },
      include: { expense: { select: { groupId: true, paidBy: true } } },
    });
    if (!guest || guest.expiresAt < new Date()) {
      throw new ApiError(404, "This link is invalid or has expired.");
    }

    // Changing their mind after the payer has confirmed the money arrived
    // would take a real payment back out of the books.
    if (guest.status === "PAID") {
      throw new ApiError(400, "This share has already been paid.");
    }

    await db.expenseGuest.update({
      where: { id: guest.id },
      data: { status: valid.choice, resolvedAt: new Date() },
    });

    // DECLINED moves the share onto the hosts; PAYING leaves it there until
    // the money actually lands. Either way the group's balances move.
    await recalculateSettlements(guest.expense.groupId);
    revalidatePath(`/groups/${guest.expense.groupId}`);
    revalidatePath(`/groups/${guest.expense.groupId}/settle`);

    // Hand back the payment details the guest just unlocked. The page was
    // rendered while they were still undecided, so it has none — without
    // this, saying "I'll pay" would loop them back to the same two buttons.
    return {
      status: valid.choice,
      payTo: valid.choice === "PAYING" ? toPayTo(guest.expense.paidBy) : null,
    };
  });
}

// The guest saying the money has left their account.
//
// Not the same as being paid, and deliberately so: this is the guest's claim,
// and the ledger only moves on the payer's confirmation. What it buys is that
// the payer can now tell "said they would" apart from "says they have", which
// is the difference between chasing someone and going to check your bank.
export async function markGuestSent(
  token: string,
): Promise<ActionResult<{ status: GuestStatus }>> {
  return asActionResult(async () => {
    const validToken = validate(z.string().min(1), token);

    const guest = await db.expenseGuest.findUnique({
      where: { token: validToken },
      include: { expense: { select: { groupId: true } } },
    });
    if (!guest || guest.expiresAt < new Date()) {
      throw new ApiError(404, "This link is invalid or has expired.");
    }
    if (guest.status === "PAID") {
      throw new ApiError(400, "This share has already been paid.");
    }

    await db.expenseGuest.update({
      where: { id: guest.id },
      data: { status: "SENT", resolvedAt: new Date() },
    });

    // Nothing has moved on the books — see guest-shares.ts — but the payer's
    // view of this expense has changed, so it has to be redrawn.
    revalidatePath(`/groups/${guest.expense.groupId}`);

    return { status: "SENT" as GuestStatus };
  });
}

/**
 * The payer saying it did not arrive.
 *
 * The other half of confirming, and the half that was missing. A guest could
 * say they had sent money — by mistake, or optimistically, or having typed an
 * account number wrong — and the payer's only choices were to confirm money
 * they never got, or to leave the claim standing for ever. Neither is a way
 * to run a shared account.
 *
 * Puts them back to PAYING rather than UNDECIDED: they still intend to pay,
 * their link still works, and the payment details are still in front of them.
 * The point is to let them try again, not to make them start over.
 *
 * Nothing needs unwinding on the group's books, because SENT never moved
 * them — which is exactly why SENT was built not to.
 */
export async function rejectGuestPayment(
  guestId: string,
): Promise<ActionResult<void>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const validId = validate(cuid, guestId);

    const guest = await db.expenseGuest.findUniqueOrThrow({
      where: { id: validId },
      include: { expense: { select: { groupId: true, paidById: true } } },
    });

    if (guest.expense.paidById !== session.id) {
      throw new ApiError(
        403,
        "Only the person who paid can say this money didn't arrive.",
      );
    }
    // Confirmed money is not up for reversal here. Undoing a receipt is a
    // different, heavier thing than disputing a claim about one.
    if (guest.status === "PAID") {
      throw new ApiError(
        400,
        "This share is already marked as received. Edit the expense if that's wrong.",
      );
    }
    if (guest.status !== "SENT") return;

    await db.expenseGuest.update({
      where: { id: guest.id },
      data: { status: "PAYING", resolvedAt: new Date() },
    });

    revalidatePath(`/groups/${guest.expense.groupId}`);
    revalidatePath(`/groups/${guest.expense.groupId}/settle`);
  });
}

// The payer confirming the money reached them — the only transition that
// takes a guest's share off the group's books.
export async function confirmGuestPaid(guestId: string): Promise<ActionResult<void>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const validId = validate(cuid, guestId);

    const guest = await db.expenseGuest.findUniqueOrThrow({
      where: { id: validId },
      include: {
        expense: {
          select: {
            groupId: true,
            paidById: true,
            items: { include: { participants: true } },
            guests: { include: { hosts: true } },
          },
        },
      },
    });

    if (guest.expense.paidById !== session.id) {
      throw new ApiError(
        403,
        "Only the person who paid can confirm they received this money.",
      );
    }
    if (guest.status === "PAID") return;

    // Frozen now, while the split still describes what they were asked for.
    // After this the share stops being owed and becomes a record of something
    // that happened, and editing the bill next month must not rewrite it.
    const item = guest.expense.items[0];
    const paidAmount = item
      ? deriveItemShares({
          totalCents: toCents(item.amount),
          memberIds: item.participants.map((p) => p.userId),
          guests: guest.expense.guests.map((g) => ({
            id: g.id,
            status: g.status,
            hostIds: g.hosts.map((h) => h.userId),
          })),
        }).guestShareCents[guest.id]
      : undefined;

    await db.expenseGuest.update({
      where: { id: guest.id },
      data: {
        status: "PAID",
        resolvedAt: new Date(),
        ...(paidAmount === undefined
          ? {}
          : { paidAmount: (paidAmount / 100).toFixed(2) }),
      },
    });

    await recalculateSettlements(guest.expense.groupId);
    revalidatePath(`/groups/${guest.expense.groupId}`);
    revalidatePath(`/groups/${guest.expense.groupId}/settle`);
  });
}
