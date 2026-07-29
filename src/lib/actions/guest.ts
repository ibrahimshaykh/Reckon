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
    // for — it reached the payer but no longer maps to anything.
    if (guest.status === "PAID" || guest.status === "PAYING") {
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

export type GuestPayTo = {
  venmoHandle: string | null;
  easypaisaNumber: string | null;
  jazzcashNumber: string | null;
  nayapayHandle: string | null;
  bankDetails: string | null;
};

export type GuestHost = GuestPayTo & {
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
};

function toPayTo(payer: {
  venmoHandle: string | null;
  easypaisaNumber: string | null;
  jazzcashNumber: string | null;
  nayapayHandle: string | null;
  bankDetails: string | null;
}): GuestPayTo {
  return {
    venmoHandle: payer.venmoHandle,
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
  const committed = guest.status === "PAYING" || guest.status === "PAID";

  // "The hosts have squared up" means two things at once: nothing involving
  // them is still outstanding, AND something of theirs was actually settled.
  // Requiring the second half matters — a host who is also the payer can owe
  // nobody and have no rows at all, and treating that emptiness as "already
  // covered" would wave a guest away while their host is still out of pocket.
  const hostIds = guest.hosts.map((h) => h.userId);
  const [outstanding, settled] = await Promise.all([
    db.settlement.count({
      where: {
        groupId: expense.groupId,
        status: { not: "CONFIRMED" },
        OR: [{ fromUserId: { in: hostIds } }, { toUserId: { in: hostIds } }],
      },
    }),
    db.settlement.count({
      where: {
        groupId: expense.groupId,
        status: "CONFIRMED",
        OR: [{ fromUserId: { in: hostIds } }, { toUserId: { in: hostIds } }],
      },
    }),
  ]);
  const covered = guest.status !== "PAID" && outstanding === 0 && settled > 0;

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
      ...toPayTo(h.user),
    })),
  };
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

// The payer confirming the money reached them — the only transition that
// takes a guest's share off the group's books.
export async function confirmGuestPaid(guestId: string): Promise<ActionResult<void>> {
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
        "Only the person who paid can confirm they received this money.",
      );
    }
    if (guest.status === "PAID") return;

    await db.expenseGuest.update({
      where: { id: guest.id },
      data: { status: "PAID", resolvedAt: new Date() },
    });

    await recalculateSettlements(guest.expense.groupId);
    revalidatePath(`/groups/${guest.expense.groupId}`);
    revalidatePath(`/groups/${guest.expense.groupId}/settle`);
  });
}
