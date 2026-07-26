import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSafepayClient } from "@/lib/safepay";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const safepay = getSafepayClient();
  if (!safepay) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const body = await request.json();
  // The SDK expects a Node-style request ({ body, headers }), not the Web
  // Request object Next's route handlers give us — reconstruct that shape.
  const headers = Object.fromEntries(request.headers.entries());

  const valid = safepay.verify.webhook({ body, headers });
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  // Best-effort field lookup — Safepay's public docs don't spell out the
  // exact webhook payload shape, so this must be confirmed against a real
  // sandbox webhook once SAFEPAY_* keys exist, and adjusted if it differs.
  const settlementId: string | undefined =
    body?.data?.tracker?.order_id ?? body?.data?.order_id ?? body?.orderId;

  if (!settlementId) {
    logger.warn("Safepay webhook: no order_id found in payload", { body });
    return NextResponse.json({ received: true });
  }

  // A verified real charge is stronger proof than the self-reported
  // mark-paid/confirm-received flow, so it goes straight to CONFIRMED.
  await db.settlement
    .update({ where: { id: settlementId }, data: { status: "CONFIRMED" } })
    .catch((error) => logger.error("Safepay webhook: settlement update failed", { error, settlementId }));

  return NextResponse.json({ received: true });
}
