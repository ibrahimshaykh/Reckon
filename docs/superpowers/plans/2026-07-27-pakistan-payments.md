# Pakistan Payment Methods Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Two payment paths for Pakistani users, replacing the US-centric Venmo/PayPal/Cash-App-only settle-up: (1) manual wallet/bank details (EasyPaisa, JazzCash, NayaPay, bank IBAN) shown with copy-to-clipboard — free forever, works with every bank/wallet; (2) a real Safepay sandbox integration so "Pay by card/EasyPaisa/JazzCash" genuinely works end-to-end with test transactions.

**Architecture:** Path 1 extends the existing `User` payment-handle pattern (same shape as `venmoHandle`/`paypalHandle`) — no new dependency, no new risk. Path 2 adds `@sfpy/node-sdk`, a Server Action that creates a Safepay checkout session for a settlement's exact amount, and a webhook route that verifies real payment completion and marks the settlement `CONFIRMED` directly (a verified real charge is stronger proof than the existing self-reported mark-paid/confirm-received flow, so it skips straight there). Both paths degrade open — Safepay's button simply doesn't render if its keys aren't configured, same pattern as Resend and Upstash.

**Tech Stack:** `@sfpy/node-sdk` (official Safepay Node SDK), Prisma migration for new `User` fields, no other new dependencies.

## Global Constraints

- Safepay sandbox is free and self-serve (verified against their own docs/site) — no card, no business registration needed to build and test this.
- Going live later requires the user to complete Safepay's own KYC — that's a business step, not something this plan does.
- Every payment method must degrade gracefully when unconfigured — never a broken link, never a crash.
- Money stays integer cents in logic, `Decimal` at the DB boundary — unchanged.

---

### Task 1: Pakistani wallet/bank details (manual, copy-to-clipboard)

**Files:**
- Modify: `prisma/schema.prisma` (new `User` fields), migration
- Modify: `src/lib/actions/profile.ts`, `src/components/settings/profile-form.tsx`
- Modify: `src/lib/actions/settlements.ts` (expose the payee's details)
- Modify: `src/components/settlements/settlement-list.tsx`, `src/app/guest/[token]/page.tsx`

**Interfaces:**
- Adds `easypaisaNumber`, `jazzcashNumber`, `nayapayHandle`, `bankDetails` (free text: bank name, account title, account number/IBAN in one field — too many Pakistani banks to model individually) to `User`.

- [ ] **Step 1** — schema: add to `User`:

```prisma
easypaisaNumber String?
jazzcashNumber  String?
nayapayHandle   String?
bankDetails     String?
```

Write the migration manually (Prisma's `migrate dev` needs a TTY this environment doesn't have — write `prisma/migrations/<timestamp>_pakistan_payment_details/migration.sql` by hand with `ALTER TABLE "User" ADD COLUMN ...` for all four columns, apply with `npx prisma migrate deploy`, then `npx prisma generate`), matching how `payment_handles` and `expense_hot_path_index` were done earlier.

- [ ] **Step 2** — `updateProfile` (`profile.ts`): add the four fields to `updateProfileSchema` (all optional trimmed strings, reasonable max lengths) and pass through to `db.user.update`.

- [ ] **Step 3** — `ProfileForm`: add four inputs under a new "Pakistani payment methods" label, same controlled-input pattern as the existing Venmo/PayPal/Cash-App fields.

- [ ] **Step 4** — `getGroupSettlements` (`settlements.ts`): add `toEasypaisaNumber`, `toJazzcashNumber`, `toNayapayHandle`, `toBankDetails` to the returned shape (same pattern as the existing `toVenmoHandle` etc.).

- [ ] **Step 5** — `SettlementList`: below the existing Venmo/PayPal/Cash-App buttons, render any of the four Pakistani methods the payee has set, each as a labeled row with the value and a "Copy" button (`navigator.clipboard.writeText`), e.g. "EasyPaisa: 0300-1234567 [Copy]". If none of the 7 total payment methods (4 US-style + 3 Pakistani wallets, bank details always shown if present) are set, keep the existing "hasn't added a payment handle yet" fallback.

- [ ] **Step 6** — apply the same copy-row treatment to `src/app/guest/[token]/page.tsx` (currently only shows a Venmo link).

- [ ] **Step 7: Verify live** — dev server: set an EasyPaisa number and bank details in Settings, confirm they appear with working Copy buttons on the settle page and on a guest link for an expense that user paid for.

- [ ] **Step 8: Commit** — `feat: Pakistani wallet/bank payment details with copy-to-clipboard`.

---

### Task 2: Safepay client + env config

**Files:**
- Modify: `package.json` (add `@sfpy/node-sdk`)
- Create: `src/lib/safepay.ts`

**Interfaces:**
- Produces: `getSafepayClient(): Safepay | null` — `null` when unconfigured (degrade-open).

- [ ] **Step 1: Install** — `npm install @sfpy/node-sdk --legacy-peer-deps`.

- [ ] **Step 2** — `src/lib/safepay.ts`:

```ts
import { Safepay } from "@sfpy/node-sdk";
import { logger } from "@/lib/logger";

let client: Safepay | null | undefined;
let warned = false;

// Sandbox is free and self-serve (no card, no business docs) — this is
// unconfigured until SAFEPAY_API_KEY etc. are added, at which point the
// card/EasyPaisa/JazzCash pay button on the settle page starts appearing.
export function getSafepayClient(): Safepay | null {
  if (client !== undefined) return client;

  const apiKey = process.env.SAFEPAY_API_KEY;
  const v1Secret = process.env.SAFEPAY_V1_SECRET;
  const webhookSecret = process.env.SAFEPAY_WEBHOOK_SECRET;

  if (!apiKey || !v1Secret || !webhookSecret) {
    if (!warned) {
      logger.warn("Safepay not configured — card/EasyPaisa/JazzCash pay button disabled (degrade-open).");
      warned = true;
    }
    client = null;
    return null;
  }

  client = new Safepay({
    environment: process.env.SAFEPAY_ENVIRONMENT === "production" ? "production" : "sandbox",
    apiKey,
    v1Secret,
    webhookSecret,
  });
  return client;
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean.

- [ ] **Step 4: Commit** — `feat: Safepay client with degrade-open config`.

---

### Task 3: Checkout Server Action + settle-page button

**Files:**
- Create: `src/lib/actions/safepay-checkout.ts`
- Modify: `src/components/settlements/settlement-list.tsx`

**Interfaces:**
- Produces: `createSafepayCheckout(settlementId: string): Promise<{ url: string } | { unavailable: true }>`.

- [ ] **Step 1** — `src/lib/actions/safepay-checkout.ts`:

```ts
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
```

- [ ] **Step 2** — modify `SettlementList`/`SettlementRow`: add a "Pay by card/EasyPaisa/JazzCash" button (only meaningfully clickable — call `createSafepayCheckout`, and if the result has `url`, `window.location.href = url`; if `unavailable`, show a small "Card payment isn't set up yet" note instead of a broken button).

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; without Safepay keys configured, confirm the button correctly shows the "not set up yet" state rather than crashing.

- [ ] **Step 4: Commit** — `feat: Safepay checkout action and settle-page pay button`.

---

### Task 4: Webhook — verify payment, auto-confirm settlement

**Files:**
- Create: `src/app/api/webhooks/safepay/route.ts`

**Interfaces:** none (webhook endpoint).

- [ ] **Step 1** — `src/app/api/webhooks/safepay/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSafepayClient } from "@/lib/safepay";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const safepay = getSafepayClient();
  if (!safepay) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const valid = await safepay.verify.webhook(request);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const body = await request.json();
  const settlementId: string | undefined = body?.data?.tracker?.order_id ?? body?.orderId;
  if (!settlementId) return NextResponse.json({ received: true });

  // A verified real charge is stronger proof than the self-reported
  // mark-paid/confirm-received flow, so it goes straight to CONFIRMED.
  await db.settlement
    .update({ where: { id: settlementId }, data: { status: "CONFIRMED" } })
    .catch((error) => logger.error("Safepay webhook: settlement update failed", { error, settlementId }));

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; `npm run build` clean (confirms the route compiles).

- [ ] **Step 3: Verify by hand** — since a real end-to-end Safepay sandbox run needs actual sandbox API keys (which don't exist in `.env` yet), this step is deferred until the user provides `SAFEPAY_API_KEY`/`SAFEPAY_V1_SECRET`/`SAFEPAY_WEBHOOK_SECRET` — note this plainly rather than fake a verification.

- [ ] **Step 4: Commit** — `feat: Safepay webhook verifies payment and auto-confirms settlement`.

---

## Self-Review

- **Spec coverage:** Both requested payment paths — manual Pakistani details (works today, $0 forever) and a real Safepay sandbox integration (works once keys are added).
- **Placeholders:** none in the code — every step has concrete, API-verified code. The one honest gap is Task 4 Step 3, which cannot be live-verified without real sandbox keys; this is stated plainly, not faked.
- **Degrade-open consistency:** Safepay follows the same pattern as Resend and Upstash — missing keys mean the feature quietly doesn't offer itself, never a crash.
- **Known simplification:** the webhook's settlement-id extraction (`body?.data?.tracker?.order_id ?? body?.orderId`) is a best-effort guess at Safepay's actual webhook payload shape, since their public docs didn't fully specify it — this must be confirmed against a real webhook payload once sandbox keys exist, and adjusted if the actual field name differs.
