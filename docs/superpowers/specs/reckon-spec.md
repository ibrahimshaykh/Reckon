# Reckon — Spec

The one source of truth for what Reckon is. Replaces the old PRD/TRD approach.
Plans in `../plans/` implement slices of this; if a plan and this spec disagree,
this spec is updated in the same commit so it never goes stale.

## What it is

A shared-life app for friend groups and roommates. It handles the recurring
friction of doing life with the same people — money, chores, and group
decisions — by computing the objectively fair answer itself and explaining
how it got there, then handing off execution to tools people already use
(Venmo/PayPal/Cash App for paying, Maps for directions). Not study-related.

## Core philosophy (runs through every feature)

Compute the objectively fair answer ourselves. Show the math so people trust
it. Hand off execution to whatever already does that job best. Never rebuild
what already exists well (no payment processor, no map renderer).

## The 16 features, in build tiers

Tier 1 must be flawless before Tier 2 is touched; Tier 2 before Tier 3. If
time runs out mid-tier, what shipped is still a complete, demoable product.

### Tier 1 — the core (the demo)
1. **Who-owes-who** — debt-minimization: fewest payments to settle everyone.
   Handles one-off and recurring shared expenses.
2. **AI receipt reading** — photo OR manual entry. Under the photo, a chat box
   to correct in plain language ("the friend payed for the beer in this photo
   bill dont add").
3. **One-tap settle-up** — deep-link to Venmo/PayPal/Cash App, pre-filled
   amount. No payment processor of our own.
4. **Show-the-math transparency** — every debt/chore/availability result can
   explain its own steps, so the number is trusted not guessed.

### Tier 2 — the other pillars
5. **Fair chore rotation** — effort-weighted; nobody always gets the worst jobs.
6. **Group availability finder** — the solid version of "calendar": computes the
   real free-time overlap across everyone who responded. (Not a shared calendar
   — the phone already has one.)
7. **Constraint-based proposal filtering** — the solid version of "polling":
   flags budget/dietary conflicts against each member's own limits. Never picks
   for the group (taste is subjective — the pizza person won't change their mind).
8. **AI query column + capability primer** — ask questions about the group's
   real data; before answering, the AI shows what it can be asked.

### Tier 3 — the depth layer
9. **Automatic no-awkwardness nudges** — the app chases the debt, not the friend.
10. **Two-way payment confirmation** — payer marks paid, receiver confirms got it.
11. **Quick 1:1 IOUs** — "I lent Sam $20", feeds the same settlement math.
12. **Cross-group debt netting** — nets a pair's balance across all shared groups.
13. **No-signup guest access** — a scoped link to view/pay one expense, no account.
14. **Fair meeting point** — computes the fairest agreed venue (lowest total group
    travel), deep-links each person to their own Maps. From the user's map idea,
    minus rebuilding a map.
15. **In-app contextual help** — how-to guidance written alongside each feature.
16. **Monthly recap** — short AI digest of the month's spending/chores/decisions.

### Explicitly cut (by the user's own reasoning)
- "Deciding where to eat" as a poll — subjective, an algorithm can't decide taste.
- "Remembering plans" as a calendar — the phone already does this.
Both survive only as their objective cores: #6 and #7.

## Decisions that are locked

- **Name:** Reckon (means both "settle accounts" and "figure out").
- **Budget:** $0. Every service on a free tier. This is why: no Google Distance
  Matrix API (needs a card — use haversine math instead), no payment processor.
- **Stack:** Next.js 16 (App Router) + TypeScript, Prisma 7 + Neon Postgres,
  Clerk auth, Gemini for AI, Inngest for scheduled jobs, Vercel Blob for receipt
  photos, Resend for nudge emails, shadcn/ui (+ Magic UI / Animate UI / Lenis for
  the landing page later). Deploy target: Vercel.

## Hard-won facts from the v1 build (bake these in, don't rediscover)

- Gemini model id is **`gemini-3.5-flash`**. `gemini-2.5-flash` returns 404 for
  new API keys — already cut off ahead of its published deprecation.
- Gemini SDK is **`@google/genai`** (the old `@google/generative-ai` is
  end-of-life). Structured output via `responseSchema` + `Type` works and is how
  receipts are parsed.
- Prisma 7's generated client requires an **explicit driver adapter**
  (`@prisma/adapter-pg`, `new PrismaClient({ adapter })`) — it no longer connects
  from the datasource block alone. Generated client imports from
  `@/generated/prisma/client`.
- Clerk removed `SignedIn`/`SignedOut`; use the **`Show`** component
  (`when="signed-in"` / `"signed-out"`). Route protection lives in the Data Access
  Layer, not middleware — Clerk's own `createRouteMatcher` is now deprecated.
  `middleware.ts` is **`proxy.ts`** in Next.js 16.
- Base UI's Button uses a **`render`** prop (not `asChild`) and needs
  `nativeButton={false}` when rendering a non-button (e.g. a Link).
- Money is integer cents + `Decimal` in the DB — never floats. Uneven splits
  (e.g. $10 / 3) assign the odd penny to the last participant so the total is
  always exact.
- The AI query needs to be told **today's date** in context, or it can't reason
  about "this month".
- Guest access needs no signing secret — a random unguessable token row in the DB
  is verified by the lookup itself.

## What "done" looks like

Two browser sessions side by side: sign in, create a group, add an expense by
receipt photo, correct it by chat, settle up with the math shown, mark paid,
confirm received — live, first try, on a real deployed URL. $0 spent.
