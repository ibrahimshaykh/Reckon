# Foundation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A running Next.js app wired to the real Neon database and Clerk auth, with the shared library layer (env, db client, DAL, error/response helpers) in place, so feature slices can be built on top.

**Architecture:** Next.js 16 App Router, single codebase. Prisma 7 + Neon Postgres via an explicit pg driver adapter. Clerk for auth, with real security checks in a Data Access Layer (not middleware). Users sync into a local `User` table lazily on first authenticated request (no webhook — a webhook needs a public URL to reach localhost in dev).

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, shadcn/ui (Base UI), Prisma 7, `@prisma/adapter-pg`, `@clerk/nextjs`, zod.

## Global Constraints

- $0 budget — every service free-tier, no card on file anywhere.
- Money is never a float: `Decimal` in the DB, integer cents in logic.
- Gemini model id is `gemini-3.5-flash`; SDK is `@google/genai`.
- Prisma 7 needs `new PrismaClient({ adapter })`; generated client imports from `@/generated/prisma/client`.
- Clerk: use `Show` (`when="signed-in"`); route protection in the DAL, not middleware; the middleware file is `proxy.ts`.
- Base UI Button: `render` prop + `nativeButton={false}` for non-button elements.
- Real credentials already exist — restore them from the backed-up `.env` (scratchpad `reckon.env.backup`), do not recreate accounts.

---

### Task 1: Scaffold + dependencies + restore credentials

**Files:**
- Create: whole Next.js app tree via `create-next-app`
- Create: `.env` (restored from backup)

- [ ] **Step 1: Scaffold** (npm names can't have capitals, so scaffold into a temp subdir and flatten, or scaffold in place since the folder is already `Reckon`):

```bash
cd /c/Users/Ibrahim/Desktop/Reckon
npx create-next-app@latest reckon-app --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git
# then flatten reckon-app/* into . and remove reckon-app/
```

- [ ] **Step 2: Set package name** — edit `package.json` `"name"` to `"reckon"`.

- [ ] **Step 3: Install deps** (use `--legacy-peer-deps`; `@hookform/resolvers` drags an optional valibot peer that otherwise fails):

```bash
npm install prisma @prisma/client @prisma/adapter-pg @clerk/nextjs zustand immer zod react-hook-form @hookform/resolvers inngest @google/genai resend @vercel/blob server-only --legacy-peer-deps
```

- [ ] **Step 4: shadcn/ui init + primitives**:

```bash
npx shadcn@latest init -y -d
npx shadcn@latest add button input select checkbox card dialog sonner skeleton avatar badge tabs table label form textarea -y
```

- [ ] **Step 5: Restore .env** from `scratchpad/reckon.env.backup` (contains real DATABASE_URL, Clerk keys, GEMINI_API_KEY, BLOB_READ_WRITE_TOKEN).

- [ ] **Step 6: Verify dev + build**:

Run: `npm run dev` (expect ready, no errors), then `npm run build` (expect clean).

- [ ] **Step 7: `git init` + commit**:

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js app with core dependencies"
```

---

### Task 2: Prisma schema + first migration

**Files:**
- Create: `prisma/schema.prisma` (all 16 models)
- Create: `src/lib/db.ts`

**Interfaces:**
- Produces: `db` (the shared PrismaClient singleton) imported by every server module.

- [ ] **Step 1: Write the full schema** — the 16 models (User, Group, GroupMember, GuestToken, Expense, ExpenseItem, ExpenseItemParticipant, Settlement, IOU, Chore, ChoreAssignment, AvailabilityEntry, Proposal, ProposalFlag, Nudge, ActivityEvent) + enums, per the v1 schema (see the spec's data notes). Money fields are `Decimal @db.Decimal(10,2)`. `generator client { provider = "prisma-client"; output = "../src/generated/prisma" }`, `datasource db { provider = "postgresql"; url = env("DATABASE_URL") }`.

- [ ] **Step 2: Migrate** against the real Neon DB:

Run: `npx prisma migrate dev --name init`
Expected: migration applied, all tables created.

- [ ] **Step 3: db client singleton** — `src/lib/db.ts`:

```ts
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

- [ ] **Step 4: Verify** — `npx prisma studio` shows every model; `npm run build` clean.

- [ ] **Step 5: Commit** — `feat: Prisma schema for all 16 models + db client`.

---

### Task 3: Env validation + shared helpers

**Files:**
- Create: `src/env.ts`, `src/lib/api-error.ts`, `src/lib/api-response.ts`, `src/lib/async-handler.ts`

**Interfaces:**
- Produces: `env` (zod-validated), `ApiError`, `apiResponse()`, `asyncHandler()`.

- [ ] **Step 1** — `src/env.ts`: zod object requiring `DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`; optional `GEMINI_API_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`. `export const env = envSchema.parse(process.env)`.
- [ ] **Step 2** — the three helpers (ApiError class, apiResponse wrapper, asyncHandler that catches ApiError → JSON envelope, else 500).
- [ ] **Step 3: Commit** — `feat: env validation + api helpers`.

---

### Task 4: Clerk auth + Data Access Layer + lazy user sync

**Files:**
- Create: `src/proxy.ts`, `src/lib/dal.ts`, `src/app/sign-in/[[...sign-in]]/page.tsx`, `src/app/sign-up/[[...sign-up]]/page.tsx`
- Modify: `src/app/layout.tsx` (ClerkProvider + header with `Show`/`UserButton`)

**Interfaces:**
- Produces: `getSession()` (returns local User or null, upserting from Clerk on first call), `requireSession()`, `generateGuestToken()`, `getGuestSession(token)`.

- [ ] **Step 1** — `proxy.ts`: `export default clerkMiddleware()` with a matcher; no redirect logic (DAL is the boundary).
- [ ] **Step 2** — `dal.ts`: `getSession` uses `currentUser()` and upserts a local `User` (email/displayName/avatar) keyed on clerkId; `requireSession` throws if null; guest helpers use a random token verified by DB lookup + `expiresAt`.
- [ ] **Step 3** — sign-in/sign-up catch-all pages rendering Clerk's `<SignIn/>` / `<SignUp/>`.
- [ ] **Step 4** — root layout: wrap in `<ClerkProvider>`, add a header with `Show when="signed-in"` (UserButton + Settings link) and `Show when="signed-out"` (SignInButton). Base UI: any Button rendering a Link uses `render={<Link/>}` + `nativeButton={false}`.
- [ ] **Step 5: Verify live** — dev server, sign up a Clerk test account (`+clerk_test@example.com`, code `424242`), confirm a `User` row appears in Prisma Studio, confirm sign-out works.
- [ ] **Step 6: Commit** — `feat: Clerk auth, DAL with lazy user sync, sign-in/up pages`.

---

## Self-Review

- **Spec coverage:** This plan is foundation only (no feature from the 16 yet) — it exists so Tier 1 can be built on a working, authenticated, migrated base. Features come in later dated plans.
- **Placeholders:** none — every command and code block is concrete.
- **Type consistency:** `db`, `getSession`, `requireSession`, `ApiError`, `apiResponse`, `asyncHandler` are the names later plans consume.
