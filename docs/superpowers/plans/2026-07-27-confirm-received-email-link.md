# Confirm-Received Email Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a debtor marks a settlement as paid, email the receiver a secure, no-login "Yes, I received this" link they can click to confirm — without opening the app or signing in.

**Architecture:** Mirrors the existing `GuestToken` pattern already used for guest expense views: an unguessable random token (reused `generateGuestToken()` from `src/lib/dal.ts`) stored on the `Settlement` row itself (1:1 cardinality — one active confirm link per settlement — so no new table is needed), with an expiry. `markPaid` generates the token and best-effort emails it via Resend (degrade-open — skips silently if `RESEND_API_KEY` isn't set, exactly like the existing nudge sweep). A new public page at `/confirm/[token]` shows the payment details and a button; **only the button click calls the confirming server action** — the page's GET request never mutates anything, so an email client's link-prefetcher or scanner bot can't falsely confirm a payment just by loading the page.

**Tech Stack:** Next.js Server Actions, Prisma 7 (Neon Postgres), Resend, existing `generateGuestToken`/token-lookup pattern from `src/lib/dal.ts`.

## Global Constraints

- Non-interactive environment: `prisma migrate dev` fails outright. Migrations are hand-written SQL files under `prisma/migrations/<timestamp>_<name>/migration.sql`, applied with `npx prisma migrate deploy`, then `npx prisma generate`.
- Every optional external service (Resend here) must degrade open: log a warning and skip, never throw, when unconfigured.
- The public confirm action takes no session — the token itself is the credential, same trust model as `GuestToken`/`getGuestSession`.
- No new UI surface beyond what's needed: no in-app display of the confirm link, no separate email-template system — inline HTML string in the `resend.emails.send` call, matching `src/lib/nudges.ts`.

---

### Task 1: Add `confirmToken`/`confirmTokenExpiresAt` to `Settlement`

**Files:**
- Modify: `prisma/schema.prisma` (Settlement model, ~line 191-212)
- Create: `prisma/migrations/20260727040000_settlement_confirm_token/migration.sql`

**Interfaces:**
- Produces: `Settlement.confirmToken: string | null`, `Settlement.confirmTokenExpiresAt: Date | null` — consumed by Tasks 2, 3, 4.

- [ ] **Step 1: Add the two fields to the schema**

In `prisma/schema.prisma`, inside `model Settlement`, add after `lastNudgedAt`:

```prisma
  lastNudgedAt        DateTime?
  confirmToken         String?          @unique
  confirmTokenExpiresAt DateTime?
  recalculatedAt DateTime         @updatedAt
```

(Full block after edit, for clarity — replace the existing `lastNudgedAt`/`recalculatedAt` lines with):

```prisma
  nudgeCount     Int              @default(0)
  lastNudgedAt   DateTime?
  confirmToken   String?          @unique
  confirmTokenExpiresAt DateTime?
  recalculatedAt DateTime         @updatedAt
```

- [ ] **Step 2: Write the migration SQL by hand**

Create `prisma/migrations/20260727040000_settlement_confirm_token/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN "confirmToken" TEXT,
ADD COLUMN "confirmTokenExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_confirmToken_key" ON "Settlement"("confirmToken");
```

- [ ] **Step 3: Apply the migration and regenerate the client**

Run: `npx prisma migrate deploy`
Expected: `1 migration found... Applied`

Run: `npx prisma generate`
Expected: Prisma Client generated successfully, no type errors.

- [ ] **Step 4: Verify with a typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (the new fields aren't referenced by any code yet, so this just confirms the client regenerated cleanly).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260727040000_settlement_confirm_token
git commit -m "feat: add confirmToken fields to Settlement for email confirm links"
```

---

### Task 2: Generate the token and email it from `markPaid`

**Files:**
- Modify: `src/lib/actions/settlements.ts` (the `markPaid` function, ~line 132-140)

**Interfaces:**
- Consumes: `generateGuestToken()` from `src/lib/dal.ts` (already exists, returns `string`); `Resend` from `"resend"` package (already a dependency, used in `src/lib/nudges.ts`); `logger` from `src/lib/logger.ts`.
- Produces: `markPaid(settlementId: string): Promise<void>` (same signature as before) — now also sets `confirmToken`/`confirmTokenExpiresAt` on the row and best-effort sends the email. No new exports.

- [ ] **Step 1: Replace `markPaid` with the token-generating, email-sending version**

In `src/lib/actions/settlements.ts`, add imports at the top:

```ts
import { Resend } from "resend";
import { generateGuestToken } from "@/lib/dal";
import { logger } from "@/lib/logger";
```

Replace the existing `markPaid` function with:

```ts
export async function markPaid(settlementId: string) {
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
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/settlements.ts
git commit -m "feat: email receiver a one-tap confirm link when a debtor marks paid"
```

---

### Task 3: Token lookup helper + public confirm action

**Files:**
- Modify: `src/lib/dal.ts` (add `getConfirmToken`, next to `getGuestSession`)
- Modify: `src/lib/actions/settlements.ts` (add `confirmReceivedByToken`, next to `confirmReceived`)

**Interfaces:**
- Produces: `getConfirmToken(token: string): Promise<Settlement | null>` (dal.ts) — consumed by Task 4's page.
- Produces: `confirmReceivedByToken(token: string): Promise<{ status: "CONFIRMED" }>` (settlements.ts, `"use server"`) — consumed by Task 4's client button. Throws `ApiError(404, ...)` if the token is missing/expired. No-ops (returns `{status:"CONFIRMED"}` without writing) if the settlement is already `CONFIRMED`, so a repeat click or a stale re-load can't double-fire side effects.

- [ ] **Step 1: Add `getConfirmToken` to `src/lib/dal.ts`**

Add after `getGuestSession`:

```ts
export async function getConfirmToken(token: string) {
  const settlement = await db.settlement.findUnique({ where: { confirmToken: token } });
  if (!settlement || !settlement.confirmTokenExpiresAt || settlement.confirmTokenExpiresAt < new Date()) {
    return null;
  }
  return settlement;
}
```

- [ ] **Step 2: Add `confirmReceivedByToken` to `src/lib/actions/settlements.ts`**

Add after `confirmReceived`:

```ts
// Public, no-login confirmation — the token itself is the credential,
// same trust model as GuestToken. Only ever called from an explicit
// button click (never from a bare page load), so an email scanner or
// link-prefetcher opening the page can't falsely confirm a payment.
export async function confirmReceivedByToken(token: string) {
  const settlement = await db.settlement.findUnique({ where: { confirmToken: token } });
  if (!settlement || !settlement.confirmTokenExpiresAt || settlement.confirmTokenExpiresAt < new Date()) {
    throw new ApiError(404, "This confirmation link is invalid or has expired.");
  }

  if (settlement.status === "PAY_MARKED") {
    await db.settlement.update({ where: { id: settlement.id }, data: { status: "CONFIRMED" } });
    revalidatePath(`/groups/${settlement.groupId}/settle`);
  }

  return { status: "CONFIRMED" as const };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/dal.ts src/lib/actions/settlements.ts
git commit -m "feat: add token-based confirm-received lookup and action"
```

---

### Task 4: Public `/confirm/[token]` page + confirm button

**Files:**
- Create: `src/app/confirm/[token]/page.tsx`
- Create: `src/components/settlements/confirm-button.tsx`

**Interfaces:**
- Consumes: `getConfirmToken(token)` from `src/lib/dal.ts` (Task 3), `confirmReceivedByToken(token)` from `src/lib/actions/settlements.ts` (Task 3), `db` from `src/lib/db.ts`.
- Produces: a working page at `/confirm/[token]`, no exports consumed elsewhere.

- [ ] **Step 1: Create the confirm button client component**

Create `src/components/settlements/confirm-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { confirmReceivedByToken } from "@/lib/actions/settlements";
import { Button } from "@/components/ui/button";

export function ConfirmButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");

  async function onClick() {
    setState("pending");
    await confirmReceivedByToken(token);
    setState("done");
  }

  if (state === "done") {
    return <p className="text-sm text-muted-foreground">Thanks — marked as confirmed!</p>;
  }

  return (
    <Button disabled={state === "pending"} onClick={onClick}>
      Yes, I received this
    </Button>
  );
}
```

- [ ] **Step 2: Create the public page**

Create `src/app/confirm/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getConfirmToken } from "@/lib/dal";
import { db } from "@/lib/db";
import { ConfirmButton } from "@/components/settlements/confirm-button";

export default async function ConfirmReceivedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const settlement = await getConfirmToken(token);
  if (!settlement) notFound();

  const [fromUser, toUser] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: settlement.fromUserId } }),
    db.user.findUniqueOrThrow({ where: { id: settlement.toUserId } }),
  ]);

  const amount = Number(settlement.amount).toFixed(2);
  const alreadyConfirmed = settlement.status === "CONFIRMED";

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Confirm payment received</h1>
      {alreadyConfirmed ? (
        <p className="text-sm text-muted-foreground">
          Already confirmed — thanks! You told {fromUser.displayName} you got the ${amount}.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Hi {toUser.displayName} — {fromUser.displayName} says they paid you ${amount}. Did
            you receive it?
          </p>
          <ConfirmButton token={token} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/confirm src/components/settlements/confirm-button.tsx
git commit -m "feat: add public /confirm/[token] page for one-tap payment confirmation"
```

---

### Task 5: End-to-end manual verification

**Files:** none (verification only — no `RESEND_API_KEY` is configured in this environment, so the email itself can't be observed; this task confirms the token/page/action chain works by reading the token straight out of the database, the same workaround already used for guest links).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background)
Expected: server listening on `http://localhost:3000` with no fresh compile errors.

- [ ] **Step 2: Trigger `markPaid` on a real settlement through the UI**

Sign in, open a group with an existing pending settlement, click "Mark as paid" as the payer. Confirm in the terminal logs that the degrade-open warning `"RESEND_API_KEY not set or receiver has no email — skipping confirm-link send"` appears (proves the token path ran without a real Resend key).

- [ ] **Step 3: Read the generated token from the database**

Use Prisma Studio or a one-off query to read `confirmToken` off the just-updated `Settlement` row, e.g.:

```bash
npx prisma studio
```

Open the `Settlement` table, find the row, copy its `confirmToken` value.

- [ ] **Step 4: Visit the confirm page and click through**

Navigate to `http://localhost:3000/confirm/<confirmToken>` in a browser with no session (or an incognito window, to prove no login is required). Confirm the page shows "Hi {receiver} — {payer} says they paid you $X" and a "Yes, I received this" button. Click it. Confirm the button is replaced with "Thanks — marked as confirmed!" without a page reload.

- [ ] **Step 5: Verify the settlement flipped to CONFIRMED**

Reload `/groups/<groupId>/settle` in the signed-in session. Confirm the row now shows "✓ Settled" (the existing `CONFIRMED` UI state in `settlement-list.tsx`).

- [ ] **Step 6: Verify replay-safety**

Revisit `http://localhost:3000/confirm/<confirmToken>` again. Confirm it now shows "Already confirmed — thanks!" instead of the button (proves a second click/reload can't cause any further state change).

- [ ] **Step 7: Verify an invalid token 404s cleanly**

Navigate to `http://localhost:3000/confirm/not-a-real-token`. Confirm Next's `not-found` page renders (no raw error, no stack trace).
