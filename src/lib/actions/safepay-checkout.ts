"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import { getSafepayClient } from "@/lib/safepay";

export async function createSafepayCheckout(settlementId: string) {
  const session = await requireSession();
  const settlement = await db.settlement.findUniqueOrThrow({ where: { id: settlementId } });

  if (settlement.fromUserId !== session.id) {
    throw new ApiError(403, "Only the person who owes can start this payment.");
  }

  const safepay = getSafepayClient();
  if (!safepay) return { unavailable: true as const };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const settleUrl = `${baseUrl}/groups/${settlement.groupId}/settle`;

  // Amount unit isn't spelled out in Safepay's public SDK — following the
  // same integer-minor-unit convention as every other payment gateway
  // (Stripe cents, etc.) until confirmed against a real sandbox response.
  const { token } = await safepay.payments.create({
    amount: Math.round(Number(settlement.amount) * 100),
    currency: "PKR",
  });

  const url = safepay.checkout.create({
    token,
    orderId: settlement.id,
    cancelUrl: settleUrl,
    redirectUrl: settleUrl,
    source: "custom",
    webhooks: true,
  });

  return { url };
}
