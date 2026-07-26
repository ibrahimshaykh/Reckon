# Backend Hardening Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Take the functionally-complete backend from "works in a demo" to "safe for a company evaluation with many concurrent users" — fixing the read-path-writes architecture flaw, adding rate limiting, wiring real input validation, building an automated test suite, adding graceful error/loading UI, and fixing the pay-link handle bug.

**Architecture:** Server Actions stay the mutation surface, but reads stop mutating: settlement persistence moves to an explicit `recalculateSettlements` called from the actions that change balances (expenses, IOUs), and the settle page becomes a pure read. A DB-level unique constraint on the settlement pair eliminates the duplicate-row race at the source. Rate limiting wraps the expensive/abusable actions via Upstash (degrading open if unconfigured, like the Resend nudge path). A single zod-validation helper guards every action's input at the boundary.

**Tech Stack:** Prisma 7 (new migration), `@upstash/ratelimit` + `@upstash/redis`, `zod` (already installed), Vitest for tests.

## Global Constraints

- Money stays integer cents in logic, `Decimal` at the DB boundary — unchanged.
- Every service degrades safely when its key is absent (Upstash keys aren't in `.env` yet, same as Resend) — never crash a request because an optional service is unconfigured.
- No behavior change visible to a correctly-behaving user — this is hardening, not new features. Every existing live-verified flow must still pass.
- Keep the superpowers dated-plan + per-task-commit rhythm.

---

### Task 1: Settlement write-path redesign + DB unique constraint

**Files:**
- Modify: `prisma/schema.prisma` (unique constraint on settlement pair), new migration
- Modify: `src/lib/actions/settlements.ts` (split read vs. recalculate)
- Modify: `src/lib/actions/expenses.ts`, `src/lib/actions/ious.ts` (call recalculate on change)

**Interfaces:**
- Produces: `recalculateSettlements(groupId)` (the only writer), `getGroupSettlements(groupId)` (now pure-read).

- [ ] **Step 1** — `prisma/schema.prisma`: add `@@unique([groupId, fromUserId, toUserId])` to `Settlement`. This makes one row per directed pair the invariant — status/amount are updated in place, and the race that produced duplicates becomes impossible at the DB level.

- [ ] **Step 2** — migrate: `npx prisma migrate dev --name settlement_pair_unique`. If existing duplicate rows block the unique index, the migration will fail; dedupe first via a one-off script (keep the most-advanced status per pair), then re-run.

- [ ] **Step 3** — rewrite `src/lib/actions/settlements.ts`:
  - `recalculateSettlements(groupId)` — computes balances (expenses + IOUs), then for each computed pair `upsert` on the `groupId_fromUserId_toUserId` unique key (update amount/explanation, keep status unless the pair no longer exists), and `deleteMany` for any non-`CONFIRMED` persisted pair no longer in the computed set. This is the writer.
  - `getGroupSettlements(groupId)` — **read only**: `db.settlement.findMany({ where: { groupId } })`, join names, return. No create/update/delete.
  - `markPaid` / `confirmReceived` — unchanged.

- [ ] **Step 4** — call `recalculateSettlements(groupId)` at the end of `addManualExpense`, `addIOU` (after the mutation, before `revalidatePath`). Import it into those actions.

- [ ] **Step 5: Verify live** — dev server: add an expense, confirm the settle page shows the right number **without** creating duplicate rows (check the DB row count stays 1 per pair across repeated page refreshes); mark-paid/confirm still work.

- [ ] **Step 6: Commit** — `refactor: move settlement persistence off the read path, add pair unique constraint`.

---

### Task 2: Rate limiting (Upstash, degrade-open)

**Files:**
- Modify: `package.json` (add `@upstash/ratelimit`, `@upstash/redis`)
- Create: `src/lib/rate-limit.ts`
- Modify: the AI + upload actions (`ai-query.ts`, `receipts.ts`, `recap.ts`) to enforce a limit

**Interfaces:**
- Produces: `enforceRateLimit(key: string, limit: number, windowSeconds: number)` — throws `ApiError(429)` when exceeded; a no-op that logs once if Upstash isn't configured.

- [ ] **Step 1: Install** — `npm install @upstash/ratelimit @upstash/redis --legacy-peer-deps`.

- [ ] **Step 2** — `src/lib/rate-limit.ts`:

```ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ApiError } from "@/lib/api-error";

let ratelimit: Ratelimit | null = null;
let warned = false;

function getLimiter(limit: number, windowSeconds: number): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    if (!warned) {
      console.warn("Upstash not configured — rate limiting is disabled (degrade-open).");
      warned = true;
    }
    return null;
  }
  ratelimit ??= new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    analytics: false,
  });
  return ratelimit;
}

// Enforces a per-user (or per-key) limit on abusable/expensive actions. When
// Upstash isn't configured the call is a no-op — the app stays usable in dev
// and only gains protection once keys exist, matching the Resend-nudge pattern.
export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const limiter = getLimiter(limit, windowSeconds);
  if (!limiter) return;
  const { success } = await limiter.limit(key);
  if (!success) {
    throw new ApiError(429, "You're doing that too fast — give it a moment and try again.");
  }
}
```

- [ ] **Step 3** — enforce in the expensive actions, keyed by `session.id`:
  - `askGroupQuestion`: `await enforceRateLimit(`ai-query:${session.id}`, 20, 60)`.
  - `getMonthlyRecap`: `await enforceRateLimit(`recap:${session.id}`, 5, 60)`.
  - `uploadAndParseReceipt` + `correctReceipt`: `await enforceRateLimit(`receipt:${session.id}`, 15, 60)`.
  (These need `session.id`, so capture the session rather than discarding it.)

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; live: confirm the AI query still works normally (limit not hit), and the warn line appears once in the dev log (proving degrade-open).

- [ ] **Step 5: Commit** — `feat: rate limiting on AI and upload actions via Upstash (degrade-open)`.

---

### Task 3: Input validation with zod at the Server Action boundary

**Files:**
- Create: `src/lib/validation.ts` (shared schemas + a `validate()` helper)
- Modify: every mutating Server Action to parse its input through a schema
- Delete: `src/lib/api-response.ts`, `src/lib/async-handler.ts` (dead code — never imported); repurpose `src/env.ts` by actually importing it

**Interfaces:**
- Produces: `validate(schema, input)` — returns parsed data or throws `ApiError(400)` with the first zod message.

- [ ] **Step 1** — `src/lib/validation.ts`:

```ts
import { z } from "zod";
import { ApiError } from "@/lib/api-error";

export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, result.error.issues[0]?.message ?? "Invalid input.");
  }
  return result.data;
}

export const cuid = z.string().min(1);
export const positiveCents = z.number().int().positive();
export const latitude = z.number().min(-90).max(90);
export const longitude = z.number().min(-180).max(180);
```

- [ ] **Step 2** — add a schema + `validate()` call at the top of each mutating action: `createGroup`, `addMemberByEmail`, `addManualExpense`, `addIOU`, `createChore`, `addAvailability`, `createProposal`, `updateProfile`, `createGuestLink`, `askGroupQuestion`. Replace the ad-hoc `if (!x.trim())` checks with the schema where it fully covers them.

- [ ] **Step 3** — make `src/env.ts` load at startup by importing it in `src/lib/db.ts` (so a missing required env var fails fast and loudly instead of at first query). Delete the two unused helper files.

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; `npm run build` clean; live: submit an invalid expense (negative amount) and confirm the friendly 400 message instead of a raw crash.

- [ ] **Step 5: Commit** — `feat: zod input validation at every Server Action boundary; remove dead helpers`.

---

### Task 4: Automated test suite (Vitest) for the pure algorithms

**Files:**
- Modify: `package.json` (add `vitest`, `test` script)
- Create: `vitest.config.ts`
- Create: `src/lib/__tests__/settlement.test.ts`, `chore-rotation.test.ts`, `availability.test.ts`, `constraint-check.test.ts`, `fair-meeting-point.test.ts`, `money.test.ts`, `pay-links.test.ts`

**Interfaces:** none (tests).

- [ ] **Step 1: Install** — `npm install -D vitest --legacy-peer-deps`; add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json` scripts.

- [ ] **Step 2** — `vitest.config.ts` with the `@/` path alias mapped to `src/` so the tests import the same way the app does.

- [ ] **Step 3** — port the throwaway verification cases I ran during the build into real committed tests (settlement: 3-way equal, uneven-penny, 2-creditor/2-debtor; chore rotation: weight ordering + catch-up; availability: 3-way overlap, no-overlap, single-user merge; constraint-check: over-budget + dietary + clean; fair-meeting-point: 111km/degree reference + fairer-option; money: toCents/fromCents rounding; pay-links: URL shape per provider), plus edge cases (empty inputs, all-settled balances).

- [ ] **Step 4: Run** — `npm test`, expect all green.

- [ ] **Step 5: Commit** — `test: Vitest suite covering all pure settlement/rotation/availability/constraint/distance algorithms`.

---

### Task 5: Graceful error / loading / not-found UI

**Files:**
- Create: `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/global-error.tsx`
- Create: `src/app/groups/[groupId]/loading.tsx` (and a couple of other slow routes)

**Interfaces:** none (Next.js special files).

- [ ] **Step 1** — `src/app/error.tsx` (Client Component, `"use client"`, receives `error` + `reset`): a calm branded message ("Something went wrong on our end.") + a "Try again" button calling `reset()`. No stack trace shown to users.

- [ ] **Step 2** — `src/app/global-error.tsx` for root-layout-level failures (must render its own `<html>`/`<body>`), and `src/app/not-found.tsx` for a friendly 404.

- [ ] **Step 3** — `loading.tsx` for the group detail and settle routes: a simple skeleton using the existing `Skeleton` component, so a slow DB wake shows a shimmer, not a blank hang.

- [ ] **Step 4: Verify live** — temporarily point `DATABASE_URL` at a bad host (or trip an error), confirm the friendly error UI renders instead of the raw Next error overlay; visit a nonexistent group id, confirm the friendly 404.

- [ ] **Step 5: Commit** — `feat: graceful error, loading, and not-found UI`.

---

### Task 6: Real payment-handle fields for pay links

**Files:**
- Modify: `prisma/schema.prisma` (add `venmoHandle`, `paypalHandle`, `cashappHandle` to User), migration
- Modify: `updateProfile` + `ProfileForm` (capture handles)
- Modify: `SettlementList` + guest page (use the payee's real handle, not their email displayName)

**Interfaces:**
- Modifies: settlement/guest data to include the payee's payment handles.

- [ ] **Step 1** — schema: add three optional `String?` handle fields to `User`; migrate `--name payment_handles`.

- [ ] **Step 2** — `updateProfile` accepts the three handles; `ProfileForm` adds three optional inputs.

- [ ] **Step 3** — `getGroupSettlements` returns the payee's handles; `SettlementList` uses the correct provider handle in `buildPayLink` (falling back to a "no handle set" note instead of a broken link). Guest page uses the payer's handle likewise.

- [ ] **Step 4: Verify live** — set a Venmo handle in settings, confirm the settle page's Venmo button now builds `venmo.com/<real-handle>` instead of an email.

- [ ] **Step 5: Commit** — `feat: real per-provider payment handles for settle-up links`.

---

### Task 7: Medium polish — N+1, logging, index review

**Files:**
- Modify: `src/lib/actions/cross-group.ts` (batch the per-group queries)
- Create: `src/lib/logger.ts` (structured logging wrapper)
- Modify: `prisma/schema.prisma` (add any missing hot-path indexes), migration

- [ ] **Step 1** — `cross-group.ts`: replace the per-group `Promise.all(map(async …))` double-fetch with two batched queries (`expense.findMany({ where: { groupId: { in: ids } } })`, same for IOUs) grouped in memory, cutting N+1 to 2.

- [ ] **Step 2** — `src/lib/logger.ts`: a thin wrapper (`logger.error/warn/info`) that emits JSON in production and readable text in dev; replace the raw `console.error(error)` in `async-handler`'s successor and the catch blocks with it.

- [ ] **Step 3** — review query `where`/`orderBy` against existing `@@index`es; add indexes for any hot path lacking one (e.g. `Expense(groupId, createdAt)` for the ordered expense list, `IOU(groupId)` already exists). Migrate `--name hot_path_indexes`.

- [ ] **Step 4: Verify** — `npm run build` clean; `npm test` still green; live smoke-test cross-group netting still shows the correct total.

- [ ] **Step 5: Commit** — `perf: batch cross-group queries, structured logging, hot-path indexes`.

---

## Self-Review

- **Coverage:** Addresses all three critical findings (read-path writes → Task 1; rate limiting → Task 2; input validation → Task 3), all three high (tests → Task 4; error UI → Task 5; pay-link handles → Task 6), and the medium items → Task 7.
- **Placeholders:** none — every task has concrete steps and the tricky code is written out.
- **Degrade-open consistency:** Upstash (Task 2) follows the exact pattern already established for Resend — build correct, no-op without keys, flag for the user.
- **No feature regressions:** every task ends with a live re-verify of the existing flow it touches; the Vitest suite (Task 4) locks the algorithms so later tasks can't silently break them.
