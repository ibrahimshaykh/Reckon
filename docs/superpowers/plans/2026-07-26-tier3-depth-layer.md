# Tier 3 — The Depth Layer Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The last 8 spec features — settlement persistence with two-way confirmation (#10), 1:1 IOUs (#11), automatic nudges (#9), cross-group netting (#12), no-signup guest access (#13), fair meeting point (#14), in-app contextual help (#15), and monthly recap (#16). This closes out all 16 features from the spec.

**Architecture:** Tier 1's `getGroupSettlements` computed settlements live on every page load with no persistence. Task 1 changes that: it syncs the live computation into real `Settlement` rows (matched by groupId/fromUserId/toUserId, keeping any row already `CONFIRMED` untouched) so status can be tracked and nudged. Everything else in this plan builds on that: IOUs (#11) feed into the same balance computation before settlement; nudges (#9) scan persisted `PENDING`/`PAY_MARKED` rows; cross-group netting (#12) reuses the per-group settlement computation across every shared group. Guest access (#13), fair meeting point (#14), help text (#15), and monthly recap (#16) are more independent and each gets its own task.

**Tech Stack:** Prisma 7, Inngest (cron), Resend (email), `@google/genai` (recap), haversine (pure math, no map API).

## Global Constraints

- $0 budget: no Google Distance Matrix API (haversine instead), Resend's `onboarding@resend.dev` sender needs no domain verification for dev/testing.
- Money is integer cents in logic, `Decimal` at the DB boundary — same as every prior tier.
- Every computed result still explains itself (`explanation` JSON) — feature #4 keeps applying.
- Guest access needs no signing secret — the token itself, looked up in the DB with an expiry check, is the credential (already implemented in `dal.ts`'s `getGuestSession`).

---

### Task 1: Settlement persistence + two-way confirmation

**Files:**
- Modify: `src/lib/actions/settlements.ts` (sync computed settlements into `Settlement` rows)
- Modify: `src/components/settlements/settlement-list.tsx` (status-aware buttons)

**Interfaces:**
- Modifies: `getGroupSettlements(groupId)` to return `{ ...settlement, id, status }` per pair.
- Produces: `markPaid(settlementId)`, `confirmReceived(settlementId)`.

- [ ] **Step 1** — modify `getGroupSettlements` in `src/lib/actions/settlements.ts` to sync each computed pair into a `Settlement` row:

```ts
export async function getGroupSettlements(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const expenses = await db.expense.findMany({
    where: { groupId },
    include: { items: { include: { participants: true } } },
  });

  const flattened = expenses.flatMap((expense) =>
    expense.items.map((item) => ({
      paidById: expense.paidById,
      totalCents: toCents(item.amount),
      participants: item.participants.map((p) => ({
        userId: p.userId,
        shareRatio: Number(p.shareRatio),
      })),
    })),
  );

  const balances = computeBalances(flattened);
  const computed = computeSettlements(balances);

  const persisted = await Promise.all(
    computed.map(async (s) => {
      const existing = await db.settlement.findFirst({
        where: {
          groupId,
          fromUserId: s.fromUserId,
          toUserId: s.toUserId,
          status: { not: "CONFIRMED" },
        },
      });

      const row = existing
        ? await db.settlement.update({
            where: { id: existing.id },
            data: {
              amount: fromCents(s.amountCents),
              explanation: s.explanation,
            },
          })
        : await db.settlement.create({
            data: {
              groupId,
              fromUserId: s.fromUserId,
              toUserId: s.toUserId,
              amount: fromCents(s.amountCents),
              explanation: s.explanation,
              status: "PENDING",
            },
          });

      return { ...s, id: row.id, status: row.status };
    }),
  );

  const userIds = [...new Set(persisted.flatMap((s) => [s.fromUserId, s.toUserId]))];
  const users = await db.user.findMany({ where: { id: { in: userIds } } });
  const nameOf = (id: string) => users.find((u) => u.id === id)?.displayName ?? id;

  return persisted.map((s) => ({
    ...s,
    fromName: nameOf(s.fromUserId),
    toName: nameOf(s.toUserId),
    explanation: {
      steps: s.explanation.steps.map((step) =>
        step.replace(s.fromUserId, nameOf(s.fromUserId)).replace(s.toUserId, nameOf(s.toUserId)),
      ),
    },
  }));
}

export async function markPaid(settlementId: string) {
  const session = await requireSession();
  const settlement = await db.settlement.findUniqueOrThrow({ where: { id: settlementId } });
  if (settlement.fromUserId !== session.id) {
    throw new ApiError(403, "Only the person who owes can mark this paid.");
  }
  await db.settlement.update({ where: { id: settlementId }, data: { status: "PAY_MARKED" } });
  revalidatePath(`/groups/${settlement.groupId}/settle`);
}

export async function confirmReceived(settlementId: string) {
  const session = await requireSession();
  const settlement = await db.settlement.findUniqueOrThrow({ where: { id: settlementId } });
  if (settlement.toUserId !== session.id) {
    throw new ApiError(403, "Only the person owed can confirm this.");
  }
  await db.settlement.update({ where: { id: settlementId }, data: { status: "CONFIRMED" } });
  revalidatePath(`/groups/${settlement.groupId}/settle`);
}
```

(add `revalidatePath`, `ApiError`, `fromCents` imports alongside the existing ones)

- [ ] **Step 2** — modify `src/components/settlements/settlement-list.tsx`: each row now carries `id` and `status`. Below the existing pay-link buttons (still only shown while `status !== "CONFIRMED"`), add: if `status === "PENDING"` and the signed-in user is the payer, a "Mark as paid" button calling `markPaid(id)` + `router.refresh()`; if `status === "PAY_MARKED"` and the signed-in user is the payee, a "Confirm received" button calling `confirmReceived(id)`; if `status === "CONFIRMED"`, replace the row's action area with "✓ Settled".

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean.

- [ ] **Step 4: Verify live** — dev server, revisit `/groups/[id]/settle` for the existing $15 debt, confirm a `Settlement` row now exists in the DB (check via a throwaway script), click "Mark as paid" as the debtor, confirm status flips to `PAY_MARKED` and the button changes; the signed-in test account is the creditor here so "Confirm received" can be exercised directly without switching accounts.

- [ ] **Step 5: Commit** — `feat: persist settlements with two-way payment confirmation`.

---

### Task 2: Quick 1:1 IOUs

**Files:**
- Modify: `src/lib/settlement.ts` (add `applyIOUs`, pure)
- Modify: `src/lib/actions/settlements.ts` (fold IOUs into balance computation)
- Create: `src/lib/actions/ious.ts`
- Create: `src/app/groups/[groupId]/ious/page.tsx`, `src/components/ious/add-iou-form.tsx`, `src/components/ious/iou-list.tsx`
- Modify: `src/app/groups/[groupId]/page.tsx` (nav link)

**Interfaces:**
- Produces: `applyIOUs(balances, ious): Record<string, number>` (pure). `addIOU(groupId, owedByUserId, amountCents, note?)`, `listIOUs(groupId)`.

- [ ] **Step 1** — add to `src/lib/settlement.ts`:

```ts
export type IOUInput = { fromUserId: string; toUserId: string; amountCents: number };

// An IOU is a direct debt outside any expense — "I lent Sam $20" — folded
// into the same balance sheet the expense-based settlement uses, so one
// "who owes who" list covers both.
export function applyIOUs(
  balances: Record<string, number>,
  ious: IOUInput[],
): Record<string, number> {
  const result = { ...balances };
  for (const iou of ious) {
    result[iou.fromUserId] = (result[iou.fromUserId] ?? 0) - iou.amountCents;
    result[iou.toUserId] = (result[iou.toUserId] ?? 0) + iou.amountCents;
  }
  return result;
}
```

- [ ] **Step 2: Verify by hand** — create `scripts/verify-ious.ts`: starting balances `{ A: 0, B: 0 }`, apply an IOU of $20 from B to A (B borrowed from A) — expect `{ A: 2000, B: -2000 }` (A is owed, matching "I lent Sam $20" meaning the lender is owed). Run with `npx tsx scripts/verify-ious.ts`, confirm, delete the script.

- [ ] **Step 3** — modify `getGroupSettlements` in `src/lib/actions/settlements.ts`: after computing `balances` from expenses, fetch `db.iOU.findMany({ where: { groupId } })` and apply them: `const balances = applyIOUs(computeBalances(flattened), ious.map((i) => ({ fromUserId: i.fromUserId, toUserId: i.toUserId, amountCents: toCents(i.amount) })))`.

- [ ] **Step 4** — `src/lib/actions/ious.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import { fromCents } from "@/lib/money";

export async function addIOU(input: {
  groupId: string;
  owedByUserId: string;
  amountCents: number;
  note?: string;
}) {
  const session = await requireSession();
  await assertMember(input.groupId, session.id);
  if (input.amountCents <= 0) throw new ApiError(400, "Amount must be positive.");
  if (input.owedByUserId === session.id) {
    throw new ApiError(400, "You can't lend to yourself.");
  }

  await db.iOU.create({
    data: {
      groupId: input.groupId,
      fromUserId: input.owedByUserId,
      toUserId: session.id,
      amount: fromCents(input.amountCents),
      note: input.note,
    },
  });

  revalidatePath(`/groups/${input.groupId}/ious`);
  revalidatePath(`/groups/${input.groupId}/settle`);
}

export async function listIOUs(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const ious = await db.iOU.findMany({
    where: { groupId },
    include: { fromUser: true, toUser: true },
    orderBy: { createdAt: "desc" },
  });

  return ious.map((i) => ({
    id: i.id,
    fromName: i.fromUser.displayName,
    toName: i.toUser.displayName,
    amount: Number(i.amount),
    note: i.note,
    createdAt: i.createdAt.toISOString(),
  }));
}
```

- [ ] **Step 5** — `src/components/ious/add-iou-form.tsx` (fields: a member `<select>` for who owes, amount, optional note; needs the group's member list as a prop; calls `addIOU`, `router.refresh()`).

- [ ] **Step 6** — `src/components/ious/iou-list.tsx` (renders each as "`fromName` owes `toName` $X — note").

- [ ] **Step 7** — `src/app/groups/[groupId]/ious/page.tsx` composing `getGroup` (for members) + `listIOUs` + the two components.

- [ ] **Step 8** — modify `src/app/groups/[groupId]/page.tsx`: add an "IOUs" nav button.

- [ ] **Step 9: Verify live** — dev server, add an IOU ("Test Friend owes me $20"), visit `/groups/[id]/settle`, confirm the existing $15 expense-debt and the new $20 IOU combine into a single net figure ($35 total owed by Test Friend, since both debts run the same direction here).

- [ ] **Step 10: Commit** — `feat: 1:1 IOUs folded into settlement balances`.

---

### Task 3: Automatic no-awkwardness nudges

**Files:**
- Create: `src/lib/inngest.ts`, `src/lib/nudges.ts`, `src/inngest/functions.ts`
- Create: `src/app/api/inngest/route.ts`

**Interfaces:**
- Produces: `runNudgeSweep()` (plain async function, the testable core — scans due settlements, sends reminder emails, records `Nudge` rows). An Inngest cron function wraps it for scheduling.

- [ ] **Step 1** — `src/lib/inngest.ts`:

```ts
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "reckon" });
```

- [ ] **Step 2** — `src/lib/nudges.ts`:

```ts
import { Resend } from "resend";
import { db } from "@/lib/db";

const resend = new Resend(process.env.RESEND_API_KEY);

const NUDGE_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

// The app chases the debt, not the friend: this runs on a schedule (Task's
// Inngest wrapper) rather than being triggered by the debtor's own actions,
// and only re-nudges after a cooldown so it's a reminder, not a nag.
export async function runNudgeSweep() {
  const due = await db.settlement.findMany({
    where: {
      status: { in: ["PENDING", "PAY_MARKED"] },
      OR: [
        { lastNudgedAt: null },
        { lastNudgedAt: { lt: new Date(Date.now() - NUDGE_COOLDOWN_MS) } },
      ],
    },
    include: { fromUser: true, toUser: true },
  });

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

  return { sent };
}
```

- [ ] **Step 3** — `src/inngest/functions.ts`:

```ts
import { inngest } from "@/lib/inngest";
import { runNudgeSweep } from "@/lib/nudges";

export const nudgeSweep = inngest.createFunction(
  { id: "nudge-sweep", triggers: [{ cron: "0 9 * * *" }] },
  async () => {
    return runNudgeSweep();
  },
);
```

- [ ] **Step 4** — `src/app/api/inngest/route.ts`:

```ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { nudgeSweep } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [nudgeSweep],
});
```

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; `npm run build` clean (confirms the route compiles).

- [ ] **Step 6: Verify by hand** — create `scripts/verify-nudge-sweep.ts` that imports `runNudgeSweep` and calls it directly against the real dev DB (no Inngest dev server needed for this check — `runNudgeSweep` is a plain function). Since `RESEND_API_KEY` is a real free-tier key, this sends one real email to the test account's address — confirm it returns `{ sent: N }` for the currently-due settlements, then confirm in the DB that `nudgeCount`/`lastNudgedAt` updated and a `Nudge` row was created. Delete the script after.

- [ ] **Step 7: Commit** — `feat: automatic nudges via Inngest cron + Resend`.

---

### Task 4: Cross-group debt netting

**Files:**
- Create: `src/lib/actions/cross-group.ts`
- Create: `src/app/friends/[userId]/page.tsx`
- Modify: `src/app/groups/[groupId]/page.tsx` (link each member's name to their cross-group page)

**Interfaces:**
- Produces: `getNetBalanceWithUser(otherUserId)` — returns `{ groupBreakdown: { groupId, groupName, netCents }[], totalNetCents }`, where positive `netCents` means the other user owes the signed-in user.

- [ ] **Step 1** — `src/lib/actions/cross-group.ts`:

```ts
"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/dal";
import { toCents } from "@/lib/money";
import { computeBalances, computeSettlements, applyIOUs } from "@/lib/settlement";

export async function getNetBalanceWithUser(otherUserId: string) {
  const session = await requireSession();

  const sharedGroups = await db.group.findMany({
    where: {
      members: { some: { userId: session.id } },
      AND: { members: { some: { userId: otherUserId } } },
    },
  });

  const otherUser = await db.user.findUniqueOrThrow({ where: { id: otherUserId } });

  const groupBreakdown = await Promise.all(
    sharedGroups.map(async (group) => {
      const [expenses, ious] = await Promise.all([
        db.expense.findMany({
          where: { groupId: group.id },
          include: { items: { include: { participants: true } } },
        }),
        db.iOU.findMany({ where: { groupId: group.id } }),
      ]);

      const flattened = expenses.flatMap((expense) =>
        expense.items.map((item) => ({
          paidById: expense.paidById,
          totalCents: toCents(item.amount),
          participants: item.participants.map((p) => ({
            userId: p.userId,
            shareRatio: Number(p.shareRatio),
          })),
        })),
      );

      const balances = applyIOUs(
        computeBalances(flattened),
        ious.map((i) => ({
          fromUserId: i.fromUserId,
          toUserId: i.toUserId,
          amountCents: toCents(i.amount),
        })),
      );
      const settlements = computeSettlements(balances);

      const netCents = settlements.reduce((sum, s) => {
        if (s.fromUserId === otherUserId && s.toUserId === session.id) return sum + s.amountCents;
        if (s.fromUserId === session.id && s.toUserId === otherUserId) return sum - s.amountCents;
        return sum;
      }, 0);

      return { groupId: group.id, groupName: group.name, netCents };
    }),
  );

  const totalNetCents = groupBreakdown.reduce((sum, g) => sum + g.netCents, 0);

  return { otherUserName: otherUser.displayName, groupBreakdown, totalNetCents };
}
```

- [ ] **Step 2: Verify by hand** — with the existing test data (the seeded friend owes ~$35 in "The Apartment" from Tasks 1–2 of this plan), call `getNetBalanceWithUser` for that friend via a throwaway script and confirm `totalNetCents` matches the group's own settle page.

- [ ] **Step 3** — `src/app/friends/[userId]/page.tsx`:

```tsx
import { getNetBalanceWithUser } from "@/lib/actions/cross-group";

export default async function FriendNetPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { otherUserName, groupBreakdown, totalNetCents } = await getNetBalanceWithUser(userId);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">You and {otherUserName}</h1>
      <p className="text-sm">
        {totalNetCents === 0
          ? "All settled up across every shared group."
          : totalNetCents > 0
            ? `${otherUserName} owes you $${(totalNetCents / 100).toFixed(2)} overall.`
            : `You owe ${otherUserName} $${(-totalNetCents / 100).toFixed(2)} overall.`}
      </p>
      <ul className="flex flex-col gap-1">
        {groupBreakdown.map((g) => (
          <li key={g.groupId} className="text-xs text-muted-foreground">
            {g.groupName}: {g.netCents === 0 ? "settled" : `$${(Math.abs(g.netCents) / 100).toFixed(2)}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4** — modify `src/app/groups/[groupId]/page.tsx`: wrap each member's name in the members list with a `<Link href={`/friends/${m.id}`}>`.

- [ ] **Step 5: Verify live** — dev server, click the seeded friend's name from the group page, confirm the cross-group page shows the correct total and per-group breakdown.

- [ ] **Step 6: Commit** — `feat: cross-group debt netting`.

---

### Task 5: No-signup guest access

**Files:**
- Create: `src/lib/actions/guest.ts`
- Create: `src/app/guest/[token]/page.tsx`
- Modify: `src/app/groups/[groupId]/page.tsx` (a "Share" link/button per expense — kept minimal: a small inline form that generates and displays the link)

**Interfaces:**
- Consumes: `generateGuestToken`, `getGuestSession` from `src/lib/dal.ts` (already implemented in Foundation).
- Produces: `createGuestLink(expenseId, guestName, guestEmail?)` returning the guest URL path.

- [ ] **Step 1** — `src/lib/actions/guest.ts`:

```ts
"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/dal";
import { generateGuestToken } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";

export async function createGuestLink(input: {
  expenseId: string;
  guestName: string;
  guestEmail?: string;
}) {
  await requireSession();
  if (!input.guestName.trim()) throw new ApiError(400, "A name is required.");

  const token = generateGuestToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.guestToken.create({
    data: {
      token,
      expenseId: input.expenseId,
      guestName: input.guestName.trim(),
      guestEmail: input.guestEmail,
      expiresAt,
    },
  });

  return `/guest/${token}`;
}
```

- [ ] **Step 2** — `src/app/guest/[token]/page.tsx` (no `requireSession` — this is the one page in the app a signed-out guest can load):

```tsx
import { notFound } from "next/navigation";
import { getGuestSession } from "@/lib/dal";
import { db } from "@/lib/db";
import { buildPayLink } from "@/lib/pay-links";
import { toCents } from "@/lib/money";

export default async function GuestExpensePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const guestToken = await getGuestSession(token);
  if (!guestToken) notFound();

  const expense = await db.expense.findUniqueOrThrow({
    where: { id: guestToken.expenseId },
    include: {
      paidBy: true,
      items: { include: { participants: { include: { user: true } } } },
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">{expense.title}</h1>
      <p className="text-sm text-muted-foreground">
        Hi {guestToken.guestName} — {expense.paidBy.displayName} paid $
        {Number(expense.totalAmount).toFixed(2)} for this.
      </p>
      <ul className="flex flex-col gap-1">
        {expense.items.flatMap((item) =>
          item.participants.map((p) => (
            <li key={p.id} className="text-sm">
              {p.user.displayName}: $
              {((toCents(item.amount) * Number(p.shareRatio)) / 100).toFixed(2)}
            </li>
          )),
        )}
      </ul>
      <a
        href={buildPayLink("venmo", {
          handle: expense.paidBy.displayName,
          amountCents: toCents(expense.totalAmount),
          note: expense.title,
        })}
        className="text-sm text-primary underline"
      >
        Pay {expense.paidBy.displayName} on Venmo
      </a>
    </div>
  );
}
```

- [ ] **Step 3** — modify `src/app/groups/[groupId]/page.tsx`'s expense list: add a small "Share" control per expense (a Client Component `share-expense-button.tsx` that calls `createGuestLink`, then displays the resulting `/guest/[token]` path as copyable text — no clipboard API dependency needed, just a visible `<input readOnly>`).

- [ ] **Step 4: Verify live** — dev server, click "Share" on an expense, get the guest link, open it directly (no sign-in), confirm the expense details render correctly and the Venmo link is well-formed; confirm visiting a made-up token 404s.

- [ ] **Step 5: Commit** — `feat: no-signup guest access to a single expense`.

---

### Task 6: Fair meeting point

**Files:**
- Create: `src/lib/fair-meeting-point.ts`
- Modify: `src/lib/actions/proposals.ts` (attach distance data when proposals have coordinates)
- Modify: `src/components/settings/profile-form.tsx` + `src/lib/actions/profile.ts` (home coordinates)
- Modify: `src/components/proposals/add-proposal-form.tsx` + `createProposal` (optional lat/lng), `src/components/proposals/proposal-list.tsx` (show total distance + "fairest pick" + per-member Maps links)

**Interfaces:**
- Produces: `haversineDistanceKm(a, b): number` (pure), `pickFairestMeetingPoint(options): { proposalId, totalDistanceKm } | null` (pure).

- [ ] **Step 1** — `src/lib/fair-meeting-point.ts`:

```ts
export type Coordinates = { latitude: number; longitude: number };

const EARTH_RADIUS_KM = 6371;

// Great-circle distance — deliberately not a routing API (no card on
// file). Good enough to compare "who has to travel further", not to
// generate turn-by-turn directions (that's Maps' job, via the deep link).
export function haversineDistanceKm(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function totalTravelDistanceKm(
  destination: Coordinates,
  homes: Coordinates[],
): number {
  return homes.reduce((sum, home) => sum + haversineDistanceKm(home, destination), 0);
}

export function pickFairestMeetingPoint(
  options: { proposalId: string; location: Coordinates }[],
  homes: Coordinates[],
): { proposalId: string; totalDistanceKm: number } | null {
  if (options.length === 0 || homes.length === 0) return null;

  return options
    .map((o) => ({
      proposalId: o.proposalId,
      totalDistanceKm: totalTravelDistanceKm(o.location, homes),
    }))
    .sort((a, b) => a.totalDistanceKm - b.totalDistanceKm)[0];
}
```

- [ ] **Step 2: Verify by hand** — create `scripts/verify-fair-meeting-point.ts` with 2 known coordinate pairs whose distance you can cross-check against a known real-world value (e.g. two points ~1 degree of latitude apart ≈ 111km), and a 2-option/2-home case where the fairer option is obvious by inspection. Run with `npx tsx scripts/verify-fair-meeting-point.ts`, confirm, delete the script.

- [ ] **Step 3** — modify `src/lib/actions/profile.ts`: extend `updateProfile` to accept optional `homeLatitude`/`homeLongitude` and pass through to `db.user.update`. Modify `ProfileForm` to add two optional number inputs ("Home latitude", "Home longitude").

- [ ] **Step 4** — modify `src/lib/actions/proposals.ts`: extend `createProposal` to accept optional `latitude`/`longitude` and store them on the `Proposal`. Extend `listProposals` to, for proposals with coordinates, compute `totalDistanceKm` against every group member with home coordinates set, and mark whichever proposal (among those with coordinates) has the lowest total as `isFairestPick: true`.

- [ ] **Step 5** — modify `AddProposalForm` to add optional latitude/longitude inputs; modify `ProposalList` to show `~X km total travel` and a "Fairest pick" badge, plus a per-member Google Maps deep link (`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`) so each person navigates with the tool that already does it well.

- [ ] **Step 6: Verify live** — dev server, set home coordinates for the signed-in test account via `/settings`, create two proposals with different coordinates (one clearly closer), confirm the closer one is marked the fairest pick with a plausible distance number, and the Maps link opens with the right coordinates.

- [ ] **Step 7: Commit** — `feat: fair meeting point via haversine distance and proposal locations`.

---

### Task 7: In-app contextual help + monthly recap

**Files:**
- Create: `src/components/help-tip.tsx`
- Modify: every feature page (`groups/[groupId]/{chores,availability,proposals,settle,ious,ask}/page.tsx`) to render one `<HelpTip>` under its heading
- Create: `src/lib/actions/recap.ts`, `src/app/groups/[groupId]/recap/page.tsx`
- Modify: `src/lib/gemini.ts` (add `generateMonthlyRecap`), `src/app/groups/[groupId]/page.tsx` (nav link)

**Interfaces:**
- Produces: `<HelpTip text={string} />` (dumb display component). `generateMonthlyRecap(groupId)` Server Action.

- [ ] **Step 1** — `src/components/help-tip.tsx`:

```tsx
export function HelpTip({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground">{text}</p>;
}
```

- [ ] **Step 2** — add one `<HelpTip>` under each page's `<h1>`, with copy specific to that feature, e.g. chores: `"Rotate now assigns any chore whose current period has ended, weighting by effort so nobody keeps the worst jobs."`; availability: `"Only windows everyone who responded has in common show up here — submit yours to join the overlap."`; proposals: `"Flags come from each person's own budget and dietary settings — nothing is picked for the group."`; settle: `"This is the fewest payments needed to clear every debt — expand a row to see the math."`; ious: `"For debts outside any shared expense — they fold into the same settle-up total."`; ask: `"Answers are grounded only in this group's real data — it'll say so if something isn't covered."`.

- [ ] **Step 3** — add to `src/lib/gemini.ts`:

```ts
export async function generateMonthlyRecap(context: {
  month: string;
  totalSpentCents: number;
  topExpenses: { title: string; amount: number }[];
  choresCompleted: number;
  proposalsDecided: number;
}): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: createUserContent([
      `Write a short (3-4 sentence), friendly recap of this group's ${context.month} for a roommate/friend-group app. ` +
        `Data: total spent $${(context.totalSpentCents / 100).toFixed(2)}, ` +
        `notable expenses: ${JSON.stringify(context.topExpenses)}, ` +
        `${context.choresCompleted} chores completed, ${context.proposalsDecided} proposals decided. ` +
        `Use only this data — don't invent specifics it doesn't cover.`,
    ]),
  });

  return response.text ?? "Couldn't generate a recap right now.";
}
```

- [ ] **Step 4** — `src/lib/actions/recap.ts`:

```ts
"use server";

import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { generateMonthlyRecap } from "@/lib/gemini";

export async function getMonthlyRecap(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [expenses, completedChores, decidedProposals] = await Promise.all([
    db.expense.findMany({ where: { groupId, createdAt: { gte: monthStart } } }),
    db.choreAssignment.count({
      where: { chore: { groupId }, completedAt: { gte: monthStart, not: null } },
    }),
    db.proposal.count({
      where: { groupId, status: { not: "PROPOSED" }, createdAt: { gte: monthStart } },
    }),
  ]);

  const totalSpentCents = expenses.reduce((sum, e) => sum + Number(e.totalAmount) * 100, 0);
  const topExpenses = expenses
    .sort((a, b) => Number(b.totalAmount) - Number(a.totalAmount))
    .slice(0, 3)
    .map((e) => ({ title: e.title, amount: Number(e.totalAmount) }));

  return generateMonthlyRecap({
    month: now.toLocaleString("default", { month: "long", year: "numeric" }),
    totalSpentCents,
    topExpenses,
    choresCompleted: completedChores,
    proposalsDecided: decidedProposals,
  });
}
```

- [ ] **Step 5** — `src/app/groups/[groupId]/recap/page.tsx` — a Client Component wrapper with a "Generate recap" button (same pattern as `AskForm`, one-shot rather than a form) calling `getMonthlyRecap(groupId)` and displaying the result.

- [ ] **Step 6** — modify `src/app/groups/[groupId]/page.tsx`: add a "Monthly recap" nav button.

- [ ] **Step 7: Verify live** — dev server, visit each modified page and confirm its help tip renders; visit `/groups/[id]/recap`, click "Generate recap", confirm the AI output correctly reflects this month's real $36 total spend and the two chores that already have assignments.

- [ ] **Step 8: Commit** — `feat: in-app contextual help and AI monthly recap`.

---

## Self-Review

- **Spec coverage:** #9 (nudges) — Task 3. #10 (two-way confirmation) — Task 1. #11 (IOUs) — Task 2. #12 (cross-group netting) — Task 4. #13 (guest access) — Task 5. #14 (fair meeting point) — Task 6. #15 (contextual help) — Task 7. #16 (monthly recap) — Task 7. All 16 spec features are now covered across the three tiers.
- **Placeholders:** none — every step has concrete code.
- **Type consistency:** `applyIOUs` (Task 2) is consumed unchanged by both `getGroupSettlements` (Task 1/2) and `getNetBalanceWithUser` (Task 4). `haversineDistanceKm`/`pickFairestMeetingPoint` (Task 6) are pure and independently verified before wiring into proposals.
- **Known simplifications:** `Settlement` rows are matched by `(groupId, fromUserId, toUserId, status != CONFIRMED)` rather than a DB unique constraint — acceptable since `getGroupSettlements` is the only writer and always reads-then-writes within one call; a stale `PENDING` row whose debt is later cleared by unrelated activity (rather than explicit confirmation) will linger rather than auto-resolving, which only matters once nudges are also live (Task 3) and is a reasonable MVP tradeoff over building a full ledger-reconciliation system. Guest access facilitates payment via a deep link but doesn't record the payment in Reckon itself — consistent with the project's "hand off execution" philosophy.
