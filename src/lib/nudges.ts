import { Resend } from "resend";
import { db } from "@/lib/db";

const NUDGE_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

// Only re-nudges after a cooldown so it's a reminder, not a nag.
export async function findDueSettlements() {
  return db.settlement.findMany({
    where: {
      status: { in: ["PENDING", "PAY_MARKED"] },
      OR: [
        { lastNudgedAt: null },
        { lastNudgedAt: { lt: new Date(Date.now() - NUDGE_COOLDOWN_MS) } },
      ],
    },
    include: { fromUser: true, toUser: true },
  });
}

// The app chases the debt, not the friend: this runs on a schedule (the
// Inngest cron wrapper) rather than being triggered by the debtor's own
// actions.
export async function runNudgeSweep() {
  const due = await findDueSettlements();

  if (!process.env.RESEND_API_KEY) {
    console.warn(
      "RESEND_API_KEY not set — skipping nudge sweep send (no email service configured yet).",
    );
    return { sent: 0, due: due.length, skipped: true };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;

  for (const settlement of due) {
    if (!settlement.fromUser.email) continue;

    await resend.emails.send({
      from: "Reckon <onboarding@resend.dev>",
      to: settlement.fromUser.email,
      subject: `Reminder: you owe ${settlement.toUser.displayName} $${Number(settlement.amount).toFixed(2)}`,
      html: `<p>Just a nudge — you owe <strong>${settlement.toUser.displayName}</strong> $${Number(settlement.amount).toFixed(2)}. Settle up in Reckon whenever you get a chance.</p>`,
    });

    await db.$transaction([
      db.settlement.update({
        where: { id: settlement.id },
        data: { nudgeCount: { increment: 1 }, lastNudgedAt: new Date() },
      }),
      db.nudge.create({ data: { settlementId: settlement.id, channel: "EMAIL" } }),
    ]);

    sent++;
  }

  return { sent, due: due.length, skipped: false };
}
