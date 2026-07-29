"use server";

import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession, generateGuestToken } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { toCents, fromCents } from "@/lib/money";
import {
  computeBalances,
  computeSettlements,
  applyIOUs,
  splitEvenlyByRatio,
} from "@/lib/settlement";
import { deriveItemShares, toShareRatios } from "@/lib/guest-shares";
import {
  buildLedgerLines,
  type ExpenseEvidence,
  type LedgerLine,
} from "@/lib/settlement-explain";
import { asActionResult, type ActionResult } from "@/lib/action-result";

// The only writer of Settlement rows. Called from the actions that actually
// change a group's balances (adding an expense, adding an IOU) — never from
// a page read, so viewing the settle page doesn't itself mutate the database.
// One row per (groupId, fromUserId, toUserId) is the DB-enforced invariant
// (see the settlement_pair_unique migration): it's upserted in place rather
// than accumulating a new row per settle cycle.
export async function recalculateSettlements(groupId: string) {
  const [expenses, ious] = await Promise.all([
    db.expense.findMany({
      where: { groupId },
      include: {
        items: { include: { participants: true } },
        guests: { include: { hosts: true } },
      },
    }),
    // Forgiven IOUs are excluded — a forgiven debt shouldn't still count
    // against the person who owed it.
    db.iOU.findMany({ where: { groupId, forgivenAt: null } }),
  ]);

  // Two parallel outputs from one pass: the numbers the settlement engine
  // works on, and the human-readable evidence for how each number arose. They
  // come from the same arithmetic so the breakdown can't explain a figure the
  // app didn't actually charge.
  const flattened: {
    paidById: string;
    totalCents: number;
    participants: { userId: string; shareRatio: number }[];
  }[] = [];
  const evidence: ExpenseEvidence[] = [];

  for (const expense of expenses) {
    // addGuest refuses to attach a guest to anything but a single equally
    // split item, so this is unreachable unless that invariant has been
    // broken. Guessing how to wedge a guest into a scanned receipt would
    // quietly invent numbers, so fall back to the guest-free maths and make
    // noise instead — the balances stay defensible, the data gets fixed.
    const guestsApply = expense.guests.length > 0 && expense.items.length === 1;
    if (expense.guests.length > 0 && expense.items.length !== 1) {
      logger.error(
        "Expense has guests but is not a single-item split — ignoring guests for this expense.",
        { expenseId: expense.id, itemCount: expense.items.length },
      );
    }

    if (guestsApply) {
      const item = expense.items[0];
      const { memberCents, guestHostSplit, groupTotalCents } = deriveItemShares({
        totalCents: toCents(item.amount),
        memberIds: item.participants.map((p) => p.userId),
        guests: expense.guests.map((g) => ({
          id: g.id,
          status: g.status,
          hostIds: g.hosts.map((h) => h.userId),
        })),
      });

      flattened.push({
        paidById: expense.paidById,
        // The group total, not the item total: a guest who has already paid
        // the payer directly settled that money outside these books, and
        // crediting the payer for it would bill the group twice.
        totalCents: groupTotalCents,
        participants: Object.entries(toShareRatios(memberCents, groupTotalCents)).map(
          ([userId, shareRatio]) => ({ userId, shareRatio }),
        ),
      });

      evidence.push({
        title: expense.title,
        paidById: expense.paidById,
        paidCents: groupTotalCents,
        memberCents,
        guests: expense.guests.map((g) => ({
          name: g.name,
          hostSplit: guestHostSplit[g.id] ?? {},
        })),
      });
      continue;
    }

    for (const item of expense.items) {
      const totalCents = toCents(item.amount);
      const participants = item.participants.map((p) => ({
        userId: p.userId,
        shareRatio: Number(p.shareRatio),
      }));

      flattened.push({ paidById: expense.paidById, totalCents, participants });
      evidence.push({
        // A scanned receipt has many rows; naming the line as well as the
        // expense is the difference between a useful receipt and a wall.
        title:
          expense.items.length > 1 ? `${expense.title} — ${item.label}` : expense.title,
        paidById: expense.paidById,
        paidCents: totalCents,
        memberCents: splitEvenlyByRatio(totalCents, participants),
        guests: [],
      });
    }
  }

  const balances = applyIOUs(
    computeBalances(flattened),
    ious.map((i) => ({
      fromUserId: i.fromUserId,
      toUserId: i.toUserId,
      amountCents: toCents(i.amount),
    })),
  );
  const computed = computeSettlements(balances);

  // Names are resolved now rather than at read time. The old explanation
  // stored raw ids and string-replaced them when rendering, which silently
  // fails the moment an id happens to appear inside other text.
  const members = await db.groupMember.findMany({
    where: { groupId },
    include: { user: { select: { id: true, displayName: true } } },
  });
  const nameOf = (id: string) =>
    members.find((m) => m.userId === id)?.user.displayName ?? id;

  const iouEvidence = ious.map((i) => ({
    fromUserId: i.fromUserId,
    toUserId: i.toUserId,
    amountCents: toCents(i.amount),
  }));

  const linesFor = (userId: string) =>
    buildLedgerLines({ userId, expenses: evidence, ious: iouEvidence, nameOf });

  await Promise.all(
    computed.map(async (s) => {
      const key = {
        groupId_fromUserId_toUserId: {
          groupId,
          fromUserId: s.fromUserId,
          toUserId: s.toUserId,
        },
      };
      const existing = await db.settlement.findUnique({ where: key });

      const explanation = {
        ...s.explanation,
        breakdown: {
          from: linesFor(s.fromUserId),
          to: linesFor(s.toUserId),
        },
      };

      await db.settlement.upsert({
        where: key,
        update: {
          amount: fromCents(s.amountCents),
          explanation,
          // A previously-settled pair with new debt starts a fresh cycle;
          // an in-flight PENDING/PAY_MARKED cycle keeps its status so this
          // doesn't clobber "already marked paid, awaiting confirmation".
          ...(existing?.status === "CONFIRMED" ? { status: "PENDING" as const } : {}),
        },
        create: {
          groupId,
          fromUserId: s.fromUserId,
          toUserId: s.toUserId,
          amount: fromCents(s.amountCents),
          explanation,
          status: "PENDING",
        },
      });
    }),
  );

  // Pairs no longer in the computed set are fully settled by other activity
  // (e.g. an offsetting IOU) — nothing left to track for them.
  const activePairs = new Set(computed.map((s) => `${s.fromUserId}:${s.toUserId}`));
  const existingRows = await db.settlement.findMany({ where: { groupId } });
  const staleIds = existingRows
    .filter((r) => !activePairs.has(`${r.fromUserId}:${r.toUserId}`))
    .map((r) => r.id);
  if (staleIds.length > 0) {
    await db.settlement.deleteMany({ where: { id: { in: staleIds } } });
  }
}

// Pure read — no mutation. Viewing this list must never write to the
// database; recalculateSettlements (called from the actions that change
// balances) is the only writer.
export async function getGroupSettlements(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const rows = await db.settlement.findMany({ where: { groupId } });

  const userIds = [...new Set(rows.flatMap((s) => [s.fromUserId, s.toUserId]))];
  const users = await db.user.findMany({ where: { id: { in: userIds } } });
  const nameOf = (id: string) => users.find((u) => u.id === id)?.displayName ?? id;

  return rows.map((s) => {
    const explanation = s.explanation as {
      steps: string[];
      // Absent on rows written before the breakdown existed; those keep
      // showing the old algorithm steps until the group's next recalculation.
      breakdown?: { from: LedgerLine[]; to: LedgerLine[] };
    };
    const toUser = users.find((u) => u.id === s.toUserId);
    return {
      id: s.id,
      status: s.status,
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      amountCents: toCents(s.amount),
      fromName: nameOf(s.fromUserId),
      toName: nameOf(s.toUserId),
      toVenmoHandle: toUser?.venmoHandle ?? null,
      toPaypalHandle: toUser?.paypalHandle ?? null,
      toCashappHandle: toUser?.cashappHandle ?? null,
      toEasypaisaNumber: toUser?.easypaisaNumber ?? null,
      toJazzcashNumber: toUser?.jazzcashNumber ?? null,
      toNayapayHandle: toUser?.nayapayHandle ?? null,
      toBankDetails: toUser?.bankDetails ?? null,
      explanation: {
        steps: explanation.steps.map((step) =>
          step.replace(s.fromUserId, nameOf(s.fromUserId)).replace(s.toUserId, nameOf(s.toUserId)),
        ),
        breakdown: explanation.breakdown ?? null,
      },
    };
  });
}

export async function markPaid(settlementId: string): Promise<ActionResult<void>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const settlement = await db.settlement.findUniqueOrThrow({
      where: { id: settlementId },
      include: { toUser: true, fromUser: true },
    });
    if (settlement.fromUserId !== session.id) {
      throw new ApiError(403, "Only the person who owes can mark this paid.");
    }

    const confirmToken = generateGuestToken();
    const confirmTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.settlement.update({
      where: { id: settlementId },
      data: { status: "PAY_MARKED", confirmToken, confirmTokenExpiresAt },
    });
    revalidatePath(`/groups/${settlement.groupId}/settle`);

    if (!process.env.RESEND_API_KEY || !settlement.toUser.email) {
      logger.warn(
        "RESEND_API_KEY not set or receiver has no email — skipping confirm-link send (degrade-open).",
        { settlementId },
      );
      return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const resend = new Resend(process.env.RESEND_API_KEY);
    const amount = Number(settlement.amount).toFixed(2);

    await resend.emails.send({
      from: "Reckon <onboarding@resend.dev>",
      to: settlement.toUser.email,
      subject: `${settlement.fromUser.displayName} says they paid you $${amount}`,
      html: `<p>${settlement.fromUser.displayName} marked their $${amount} as paid. If you received it, confirm here:</p><p><a href="${baseUrl}/confirm/${confirmToken}">Yes, I received this</a></p>`,
    });
  });
}

export async function confirmReceived(settlementId: string): Promise<ActionResult<void>> {
  return asActionResult(async () => {
    const session = await requireSession();
    const settlement = await db.settlement.findUniqueOrThrow({ where: { id: settlementId } });
    if (settlement.toUserId !== session.id) {
      throw new ApiError(403, "Only the person owed can confirm this.");
    }
    await db.settlement.update({ where: { id: settlementId }, data: { status: "CONFIRMED" } });
    revalidatePath(`/groups/${settlement.groupId}/settle`);
  });
}

// Public, no-login confirmation — the token itself is the credential,
// same trust model as GuestToken. Only ever called from an explicit
// button click (never from a bare page load), so an email scanner or
// link-prefetcher opening the page can't falsely confirm a payment.
export async function confirmReceivedByToken(
  token: string,
): Promise<ActionResult<{ status: "CONFIRMED" }>> {
  return asActionResult(async () => {
    const settlement = await db.settlement.findUnique({ where: { confirmToken: token } });
    if (!settlement || !settlement.confirmTokenExpiresAt || settlement.confirmTokenExpiresAt < new Date()) {
      throw new ApiError(404, "This confirmation link is invalid or has expired.");
    }

    if (settlement.status === "PAY_MARKED") {
      await db.settlement.update({ where: { id: settlement.id }, data: { status: "CONFIRMED" } });
      revalidatePath(`/groups/${settlement.groupId}/settle`);
    }

    return { status: "CONFIRMED" as const };
  });
}
