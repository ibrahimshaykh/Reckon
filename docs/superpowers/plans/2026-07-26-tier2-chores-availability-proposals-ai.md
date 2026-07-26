# Tier 2 — Chores, Availability, Proposals, AI Query Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The other three pillars of the spec — fair chore rotation (#5), group availability finder (#6), constraint-based proposal filtering (#7) — plus the AI query column with a capability primer (#8). Each is a pure, hand-verifiable algorithm wired to a thin Server Action + page, following the pattern established in Tier 1 (`settlement.ts` / `getGroupSettlements`).

**Architecture:** Same as Tier 1: pure functions with no DB access for the algorithms (`chore-rotation.ts`, `availability.ts`, `constraint-check.ts`), Server Actions that fetch data, call the pure function, and persist/return results, and Server Components for pages. Every computed result carries an `explanation` so it's show-the-math-able, matching spec feature #4's promise across all features, not just settlement.

**Tech Stack:** Next.js 16 Server Actions, Prisma 7, `@google/genai` for the AI query.

## Global Constraints

- Every algorithmic result (chore assignment, proposal flag) explains itself in plain language — feature #4 applies everywhere, not just money.
- The AI query must be told today's date in its context, or it can't reason about "this month" (hard-won fact from v1).
- $0 budget — no new services.
- Route protection via `assertMember`/`requireSession` in every Server Action, same as Tier 1.

---

### Task 1: User settings (budget limit + dietary restrictions)

**Files:**
- Create: `src/lib/actions/profile.ts`, `src/app/settings/page.tsx`, `src/components/settings/profile-form.tsx`

**Interfaces:**
- Produces: `updateProfile(input: { budgetLimitCents: number | null; dietaryRestrictions: string[] })`. This is a prerequisite for Task 4 (constraint filtering needs these fields populated).

- [ ] **Step 1** — `src/lib/actions/profile.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/dal";
import { fromCents } from "@/lib/money";

export async function updateProfile(input: {
  budgetLimitCents: number | null;
  dietaryRestrictions: string[];
}) {
  const session = await requireSession();

  await db.user.update({
    where: { id: session.id },
    data: {
      budgetLimit:
        input.budgetLimitCents === null ? null : fromCents(input.budgetLimitCents),
      dietaryRestrictions: input.dietaryRestrictions,
    },
  });

  revalidatePath("/settings");
}
```

- [ ] **Step 2** — `src/components/settings/profile-form.tsx` (Client Component; comma-separated text input for dietary restrictions, kept simple rather than a tag picker):

```tsx
"use client";

import { useState } from "react";
import { updateProfile } from "@/lib/actions/profile";
import { toCents } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ProfileForm({
  initialBudgetLimit,
  initialDietaryRestrictions,
}: {
  initialBudgetLimit: number | null;
  initialDietaryRestrictions: string[];
}) {
  const [budget, setBudget] = useState(
    initialBudgetLimit === null ? "" : String(initialBudgetLimit),
  );
  const [restrictions, setRestrictions] = useState(
    initialDietaryRestrictions.join(", "),
  );
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setSaved(false);
    await updateProfile({
      budgetLimitCents: budget.trim() === "" ? null : toCents(Number(budget)),
      dietaryRestrictions: restrictions
        .split(",")
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean),
    });
    setPending(false);
    setSaved(true);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 max-w-sm">
      <label className="text-sm text-muted-foreground">
        Monthly budget limit per proposal ($, optional)
      </label>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        placeholder="e.g. 25"
      />
      <label className="text-sm text-muted-foreground">
        Dietary restrictions (comma-separated, e.g. vegetarian, gluten-free)
      </label>
      <Input
        value={restrictions}
        onChange={(e) => setRestrictions(e.target.value)}
        placeholder="vegetarian, nut-free"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {saved && <p className="text-sm text-muted-foreground">Saved.</p>}
    </form>
  );
}
```

- [ ] **Step 3** — `src/app/settings/page.tsx`:

```tsx
import { requireSession } from "@/lib/dal";
import { toCents } from "@/lib/money";
import { ProfileForm } from "@/components/settings/profile-form";

export default async function SettingsPage() {
  const session = await requireSession();

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <ProfileForm
        initialBudgetLimit={
          session.budgetLimit === null ? null : toCents(session.budgetLimit)
        }
        initialDietaryRestrictions={session.dietaryRestrictions}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify live** — dev server, visit `/settings` (linked from the header already), set a budget limit and a dietary restriction, reload, confirm they persist.

- [ ] **Step 5: Commit** — `feat: user settings for budget limit and dietary restrictions`.

---

### Task 2: Fair chore rotation

**Files:**
- Create: `src/lib/chore-rotation.ts`, `src/lib/actions/chores.ts`
- Create: `src/app/groups/[groupId]/chores/page.tsx`, `src/components/chores/add-chore-form.tsx`, `src/components/chores/chore-list.tsx`
- Modify: `src/app/groups/[groupId]/page.tsx` (nav link to chores)

**Interfaces:**
- Produces: `assignChoresForPeriod(chores, members): Record<choreId, userId>` (pure). `createChore`, `rotateChores(groupId)`, `listChores(groupId)` Server Actions.

- [ ] **Step 1** — `src/lib/chore-rotation.ts`:

```ts
export type ChoreLoad = { id: string; effortWeight: number };
export type MemberLoad = { userId: string; cumulativeEffort: number };

// Heaviest chores are assigned first, each going to whoever currently has
// the least cumulative effort — so nobody stays stuck with the worst jobs
// over time, even as chores of different weights come and go.
export function assignChoresForPeriod(
  chores: ChoreLoad[],
  members: MemberLoad[],
): Record<string, string> {
  if (members.length === 0) return {};

  const loads = members.map((m) => ({ ...m }));
  const sortedChores = [...chores].sort((a, b) => b.effortWeight - a.effortWeight);
  const assignments: Record<string, string> = {};

  for (const chore of sortedChores) {
    loads.sort(
      (a, b) =>
        a.cumulativeEffort - b.cumulativeEffort || a.userId.localeCompare(b.userId),
    );
    const chosen = loads[0];
    assignments[chore.id] = chosen.userId;
    chosen.cumulativeEffort += chore.effortWeight;
  }

  return assignments;
}
```

- [ ] **Step 2: Verify by hand** — create `scripts/verify-chore-rotation.ts` with a case (3 chores: weights 5, 3, 1; 2 members starting at 0 cumulative effort — expect the heaviest chore to member A, next heaviest to member B since A is now at 5, lightest back to B since B is still lower... trace it by hand first, then assert), run with `npx tsx scripts/verify-chore-rotation.ts`, confirm it matches, delete the script.

- [ ] **Step 3** — `src/lib/actions/chores.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import { assignChoresForPeriod } from "@/lib/chore-rotation";

type Frequency = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";

function periodLengthDays(frequency: Frequency): number {
  switch (frequency) {
    case "DAILY":
      return 1;
    case "WEEKLY":
      return 7;
    case "BIWEEKLY":
      return 14;
    case "MONTHLY":
      return 30;
  }
}

export async function createChore(input: {
  groupId: string;
  name: string;
  effortWeight: number;
  frequency: Frequency;
}) {
  const session = await requireSession();
  await assertMember(input.groupId, session.id);
  if (!input.name.trim()) throw new ApiError(400, "Chore name is required.");
  if (input.effortWeight <= 0) throw new ApiError(400, "Effort must be positive.");

  await db.chore.create({
    data: {
      groupId: input.groupId,
      name: input.name.trim(),
      effortWeight: input.effortWeight,
      frequency: input.frequency,
    },
  });

  revalidatePath(`/groups/${input.groupId}/chores`);
}

export async function rotateChores(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const [chores, members, pastAssignments] = await Promise.all([
    db.chore.findMany({ where: { groupId } }),
    db.groupMember.findMany({ where: { groupId }, include: { user: true } }),
    db.choreAssignment.findMany({ where: { chore: { groupId } } }),
  ]);

  const now = new Date();
  const needsAssignment = chores.filter((chore) => {
    const latest = pastAssignments
      .filter((a) => a.choreId === chore.id)
      .sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime())[0];
    return !latest || latest.periodEnd < now;
  });

  if (needsAssignment.length === 0 || members.length === 0) {
    return { created: 0 };
  }

  const cumulative: Record<string, number> = {};
  members.forEach((m) => (cumulative[m.userId] = 0));
  pastAssignments.forEach((a) => {
    const chore = chores.find((c) => c.id === a.choreId);
    if (chore) cumulative[a.userId] = (cumulative[a.userId] ?? 0) + chore.effortWeight;
  });

  const assignments = assignChoresForPeriod(
    needsAssignment.map((c) => ({ id: c.id, effortWeight: c.effortWeight })),
    members.map((m) => ({ userId: m.userId, cumulativeEffort: cumulative[m.userId] ?? 0 })),
  );

  await Promise.all(
    needsAssignment.map((chore) => {
      const userId = assignments[chore.id];
      const assignee = members.find((m) => m.userId === userId);
      const periodEnd = new Date(
        now.getTime() + periodLengthDays(chore.frequency) * 86_400_000,
      );

      return db.choreAssignment.create({
        data: {
          choreId: chore.id,
          userId,
          periodStart: now,
          periodEnd,
          explanation: {
            steps: [
              `${chore.name} has effort weight ${chore.effortWeight}.`,
              `${assignee?.user.displayName} had the lowest cumulative effort (${cumulative[userId] ?? 0}) of the group.`,
              `Assigned to keep total effort balanced over time.`,
            ],
          },
        },
      });
    }),
  );

  revalidatePath(`/groups/${groupId}/chores`);
  return { created: needsAssignment.length };
}

export async function listChores(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const chores = await db.chore.findMany({
    where: { groupId },
    include: {
      assignments: {
        orderBy: { periodStart: "desc" },
        take: 1,
        include: { user: true },
      },
    },
  });

  return chores.map((c) => {
    const current = c.assignments[0];
    return {
      id: c.id,
      name: c.name,
      effortWeight: c.effortWeight,
      frequency: c.frequency,
      currentAssignee: current?.user.displayName ?? null,
      periodEnd: current?.periodEnd.toISOString() ?? null,
      explanation: (current?.explanation as { steps: string[] } | undefined) ?? null,
    };
  });
}
```

- [ ] **Step 4** — `src/components/chores/add-chore-form.tsx` (same controlled-form pattern as `create-group-form.tsx`; fields: name, effort weight number input, frequency `<select>`; calls `createChore`, `router.refresh()` on success).

- [ ] **Step 5** — `src/components/chores/chore-list.tsx` (Client Component: renders each chore with its current assignee (or "Unassigned"), a "Show the math" toggle using `explanation.steps` like `SettlementList`, and a single "Rotate now" button at the top that calls `rotateChores(groupId)` then `router.refresh()`).

- [ ] **Step 6** — `src/app/groups/[groupId]/chores/page.tsx` composing `listChores` + `AddChoreForm` + `ChoreList`.

- [ ] **Step 7** — modify `src/app/groups/[groupId]/page.tsx`: add a "Chores" nav button next to "Add expense" / "Who owes who".

- [ ] **Step 8: Verify live** — dev server, add 3 chores with different effort weights to a 2-member group, click "Rotate now", confirm the heaviest chore goes to one member and lighter ones balance out, expand "Show the math", click "Rotate now" again with no new chores and confirm it reports 0 created (assignments not yet expired).

- [ ] **Step 9: Commit** — `feat: fair chore rotation with effort-weighted assignment`.

---

### Task 3: Group availability finder

**Files:**
- Create: `src/lib/availability.ts`, `src/lib/actions/availability.ts`
- Create: `src/app/groups/[groupId]/availability/page.tsx`, `src/components/availability/add-availability-form.tsx`, `src/components/availability/free-time-list.tsx`
- Modify: `src/app/groups/[groupId]/page.tsx` (nav link)

**Interfaces:**
- Produces: `findGroupFreeTime(entriesByUser: Record<string, Interval[]>): Interval[]` (pure, `Interval = { start: number; end: number }` epoch ms). `addAvailability(groupId, startsAt, endsAt, label?)`, `getGroupFreeTime(groupId)` Server Actions.

- [ ] **Step 1** — `src/lib/availability.ts`:

```ts
export type Interval = { start: number; end: number };

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
    } else {
      merged.push({ ...iv });
    }
  }
  return merged;
}

function intersectTwo(a: Interval[], b: Interval[]): Interval[] {
  const result: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);
    if (start < end) result.push({ start, end });
    if (a[i].end < b[j].end) i++;
    else j++;
  }
  return result;
}

// Free time that's common to every person who submitted at least one
// window — not a shared calendar, just the objective overlap.
export function findGroupFreeTime(
  entriesByUser: Record<string, Interval[]>,
): Interval[] {
  const sets = Object.values(entriesByUser).map(mergeIntervals);
  if (sets.length === 0) return [];

  let result = sets[0];
  for (let i = 1; i < sets.length; i++) {
    result = intersectTwo(result, sets[i]);
    if (result.length === 0) break;
  }
  return result;
}
```

- [ ] **Step 2: Verify by hand** — create `scripts/verify-availability.ts` with 3 users' interval sets where the expected overlap is a single known window (work it out by hand first), run with `npx tsx scripts/verify-availability.ts`, confirm match, delete the script.

- [ ] **Step 3** — `src/lib/actions/availability.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import { findGroupFreeTime } from "@/lib/availability";

export async function addAvailability(input: {
  groupId: string;
  startsAt: string;
  endsAt: string;
  label?: string;
}) {
  const session = await requireSession();
  await assertMember(input.groupId, session.id);

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (endsAt <= startsAt) {
    throw new ApiError(400, "End time must be after start time.");
  }

  await db.availabilityEntry.create({
    data: {
      groupId: input.groupId,
      userId: session.id,
      startsAt,
      endsAt,
      label: input.label,
    },
  });

  revalidatePath(`/groups/${input.groupId}/availability`);
}

export async function getGroupFreeTime(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const entries = await db.availabilityEntry.findMany({
    where: { groupId },
    include: { user: true },
  });

  const entriesByUser: Record<string, { start: number; end: number }[]> = {};
  for (const entry of entries) {
    (entriesByUser[entry.userId] ??= []).push({
      start: entry.startsAt.getTime(),
      end: entry.endsAt.getTime(),
    });
  }

  const respondedCount = Object.keys(entriesByUser).length;
  const freeWindows = findGroupFreeTime(entriesByUser);

  return {
    respondedCount,
    windows: freeWindows.map((w) => ({
      startsAt: new Date(w.start).toISOString(),
      endsAt: new Date(w.end).toISOString(),
    })),
  };
}
```

- [ ] **Step 4** — `src/components/availability/add-availability-form.tsx` (two `datetime-local` inputs + optional label, calls `addAvailability`, `router.refresh()`).

- [ ] **Step 5** — `src/components/availability/free-time-list.tsx` (renders `respondedCount` and each free window formatted with `toLocaleString()`; "No overlap found yet" when empty).

- [ ] **Step 6** — `src/app/groups/[groupId]/availability/page.tsx` composing `getGroupFreeTime` + the two components above.

- [ ] **Step 7** — modify `src/app/groups/[groupId]/page.tsx`: add an "Availability" nav button.

- [ ] **Step 8: Verify live** — dev server, submit two overlapping windows from the same signed-in test account under two different (fake) "responses" isn't possible with one account — instead, submit one window as the signed-in user, seed a second `AvailabilityEntry` directly for the second test user with a partially-overlapping window, confirm the computed intersection matches the overlap by hand.

- [ ] **Step 9: Commit** — `feat: group availability finder with interval intersection`.

---

### Task 4: Constraint-based proposal filtering

**Files:**
- Create: `src/lib/constraint-check.ts`, `src/lib/actions/proposals.ts`
- Create: `src/app/groups/[groupId]/proposals/page.tsx`, `src/components/proposals/add-proposal-form.tsx`, `src/components/proposals/proposal-list.tsx`
- Modify: `src/app/groups/[groupId]/page.tsx` (nav link)

**Interfaces:**
- Produces: `computeProposalFlags(proposal, members): Flag[]` (pure). `createProposal(input)`, `listProposals(groupId)` Server Actions.

- [ ] **Step 1** — `src/lib/constraint-check.ts`:

```ts
export type ProposalInput = {
  estimatedCostPerPersonCents: number | null;
  dietaryTags: string[];
};

export type MemberConstraints = {
  userId: string;
  budgetLimitCents: number | null;
  dietaryRestrictions: string[];
};

export type ProposalFlag = {
  userId: string;
  reason: "OVER_BUDGET" | "DIETARY_CONFLICT";
  detail: string;
};

// Flags against each member's own stated limits — never picks for the
// group, since taste is subjective and an algorithm can't settle that.
export function computeProposalFlags(
  proposal: ProposalInput,
  members: MemberConstraints[],
): ProposalFlag[] {
  const flags: ProposalFlag[] = [];

  for (const member of members) {
    if (
      proposal.estimatedCostPerPersonCents !== null &&
      member.budgetLimitCents !== null &&
      proposal.estimatedCostPerPersonCents > member.budgetLimitCents
    ) {
      flags.push({
        userId: member.userId,
        reason: "OVER_BUDGET",
        detail: `Estimated $${(proposal.estimatedCostPerPersonCents / 100).toFixed(2)} per person exceeds their $${(member.budgetLimitCents / 100).toFixed(2)} limit.`,
      });
    }

    const unmet = member.dietaryRestrictions.filter(
      (r) => !proposal.dietaryTags.includes(r),
    );
    if (unmet.length > 0) {
      flags.push({
        userId: member.userId,
        reason: "DIETARY_CONFLICT",
        detail: `Doesn't cover: ${unmet.join(", ")}.`,
      });
    }
  }

  return flags;
}
```

- [ ] **Step 2: Verify by hand** — create `scripts/verify-constraint-check.ts` with 3 members (one over budget, one with an unmet dietary restriction, one clean), run with `npx tsx scripts/verify-constraint-check.ts`, confirm exactly the 2 expected flags, delete the script.

- [ ] **Step 3** — `src/lib/actions/proposals.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import { toCents } from "@/lib/money";
import { computeProposalFlags } from "@/lib/constraint-check";

export async function createProposal(input: {
  groupId: string;
  title: string;
  estimatedCostPerPersonCents: number | null;
  dietaryTags: string[];
}) {
  const session = await requireSession();
  await assertMember(input.groupId, session.id);
  if (!input.title.trim()) throw new ApiError(400, "Title is required.");

  const members = await db.groupMember.findMany({
    where: { groupId: input.groupId },
    include: { user: true },
  });

  const flags = computeProposalFlags(
    {
      estimatedCostPerPersonCents: input.estimatedCostPerPersonCents,
      dietaryTags: input.dietaryTags,
    },
    members.map((m) => ({
      userId: m.userId,
      budgetLimitCents: m.user.budgetLimit === null ? null : toCents(m.user.budgetLimit),
      dietaryRestrictions: m.user.dietaryRestrictions,
    })),
  );

  await db.proposal.create({
    data: {
      groupId: input.groupId,
      proposedById: session.id,
      title: input.title.trim(),
      estimatedCostPerPerson:
        input.estimatedCostPerPersonCents === null
          ? null
          : input.estimatedCostPerPersonCents / 100,
      dietaryTags: input.dietaryTags,
      flags: {
        create: flags.map((f) => ({
          userId: f.userId,
          reason: f.reason,
          detail: f.detail,
        })),
      },
    },
  });

  revalidatePath(`/groups/${input.groupId}/proposals`);
}

export async function listProposals(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const proposals = await db.proposal.findMany({
    where: { groupId },
    include: { proposedBy: true, flags: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  });

  return proposals.map((p) => ({
    id: p.id,
    title: p.title,
    proposedByName: p.proposedBy.displayName,
    estimatedCostPerPerson:
      p.estimatedCostPerPerson === null ? null : Number(p.estimatedCostPerPerson),
    dietaryTags: p.dietaryTags,
    flags: p.flags.map((f) => ({
      userName: f.user.displayName,
      reason: f.reason,
      detail: f.detail,
    })),
  }));
}
```

- [ ] **Step 4** — `src/components/proposals/add-proposal-form.tsx` (fields: title, optional cost-per-person, comma-separated dietary tags; calls `createProposal`, `router.refresh()`).

- [ ] **Step 5** — `src/components/proposals/proposal-list.tsx` (renders each proposal with its flags listed inline, e.g. "⚠ Test Friend: Estimated $30.00 exceeds their $20.00 limit." — this *is* the show-the-math for this feature, always visible rather than behind a toggle since the flags are the point).

- [ ] **Step 6** — `src/app/groups/[groupId]/proposals/page.tsx` composing `listProposals` + `AddProposalForm` + `ProposalList`.

- [ ] **Step 7** — modify `src/app/groups/[groupId]/page.tsx`: add a "Proposals" nav button.

- [ ] **Step 8: Verify live** — dev server, set the signed-in test user's budget limit to $20 via `/settings`, create a proposal with an estimated cost of $30/person and no dietary tags while the seeded second member has a dietary restriction set — confirm both an `OVER_BUDGET` and a `DIETARY_CONFLICT` flag appear with the right people and numbers.

- [ ] **Step 9: Commit** — `feat: constraint-based proposal filtering with budget/dietary flags`.

---

### Task 5: AI query column with capability primer

**Files:**
- Create: `src/lib/actions/ai-query.ts`
- Create: `src/app/groups/[groupId]/ask/page.tsx`, `src/components/ai-query/ask-form.tsx`
- Modify: `src/lib/gemini.ts` (add a plain-text query function alongside the existing receipt-parsing ones), `src/app/groups/[groupId]/page.tsx` (nav link)

**Interfaces:**
- Produces: `answerGroupQuestion(model input)` in `gemini.ts`; `askGroupQuestion(groupId, question)` Server Action.

- [ ] **Step 1** — modify `src/lib/gemini.ts`, add:

```ts
const CAPABILITY_PRIMER = `You can ask things like:
- "How much have we spent this month?"
- "Who paid the most for groceries?"
- "What chores does Sam have this week?"
- "Are there any dietary conflicts on the pizza proposal?"`;

export function getCapabilityPrimer(): string {
  return CAPABILITY_PRIMER;
}

export async function answerGroupQuestion(
  question: string,
  context: {
    today: string;
    expenses: { title: string; totalAmount: number; paidByName: string; createdAt: string }[];
    chores: { name: string; currentAssignee: string | null; periodEnd: string | null }[];
  },
): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: createUserContent([
      `Today's date is ${context.today}.`,
      `Group expenses: ${JSON.stringify(context.expenses)}.`,
      `Group chores: ${JSON.stringify(context.chores)}.`,
      `Answer this question about the group in 1-3 short sentences, using ` +
        `only the data given. If the data doesn't cover it, say so plainly ` +
        `instead of guessing: "${question}"`,
    ]),
  });

  return response.text ?? "I couldn't come up with an answer for that.";
}
```

- [ ] **Step 2** — `src/lib/actions/ai-query.ts`:

```ts
"use server";

import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { answerGroupQuestion, getCapabilityPrimer } from "@/lib/gemini";

export { getCapabilityPrimer };

export async function askGroupQuestion(groupId: string, question: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const [expenses, chores] = await Promise.all([
    db.expense.findMany({ where: { groupId }, include: { paidBy: true } }),
    db.chore.findMany({
      where: { groupId },
      include: { assignments: { orderBy: { periodStart: "desc" }, take: 1, include: { user: true } } },
    }),
  ]);

  const answer = await answerGroupQuestion(question, {
    today: new Date().toISOString().slice(0, 10),
    expenses: expenses.map((e) => ({
      title: e.title,
      totalAmount: Number(e.totalAmount),
      paidByName: e.paidBy.displayName,
      createdAt: e.createdAt.toISOString(),
    })),
    chores: chores.map((c) => ({
      name: c.name,
      currentAssignee: c.assignments[0]?.user.displayName ?? null,
      periodEnd: c.assignments[0]?.periodEnd.toISOString() ?? null,
    })),
  });

  return answer;
}
```

- [ ] **Step 3** — `src/components/ai-query/ask-form.tsx` (Client Component: shows the capability primer as static text above the input on first render, a question input, and the answer displayed below after submit):

```tsx
"use client";

import { useState } from "react";
import { askGroupQuestion } from "@/lib/actions/ai-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AskForm({ groupId, primer }: { groupId: string; primer: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setAnswer(null);
    try {
      const result = await askGroupQuestion(groupId, question);
      setAnswer(result);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 max-w-sm">
      <pre className="whitespace-pre-wrap rounded-lg border bg-muted p-3 text-xs text-muted-foreground">
        {primer}
      </pre>
      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about this group…"
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Asking…" : "Ask"}
        </Button>
      </form>
      {answer && <p className="rounded-lg border p-3 text-sm">{answer}</p>}
    </div>
  );
}
```

- [ ] **Step 4** — `src/app/groups/[groupId]/ask/page.tsx`:

```tsx
import { getCapabilityPrimer } from "@/lib/actions/ai-query";
import { AskForm } from "@/components/ai-query/ask-form";

export default async function AskPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Ask about this group</h1>
      <AskForm groupId={groupId} primer={getCapabilityPrimer()} />
    </div>
  );
}
```

- [ ] **Step 5** — modify `src/app/groups/[groupId]/page.tsx`: add an "Ask AI" nav button.

- [ ] **Step 6: Verify live** — dev server, visit the ask page (confirm the primer renders), ask "How much have we spent so far?" and confirm the answer correctly reflects the group's actual expense total from earlier tasks (Tier 1's $30 + $6 = $36), ask an out-of-scope question ("what's the weather") and confirm it declines rather than hallucinating.

- [ ] **Step 7: Commit** — `feat: AI query column with capability primer`.

---

## Self-Review

- **Spec coverage:** #5 (chore rotation) — Task 2. #6 (availability finder) — Task 3. #7 (constraint filtering) — Task 4, depends on Task 1's settings page for real budget/dietary data. #8 (AI query + primer) — Task 5. #4 (show-the-math) extended to chores and proposals, not just settlement.
- **Placeholders:** none — every step has concrete code.
- **Type consistency:** `assignChoresForPeriod`, `findGroupFreeTime`, `computeProposalFlags` signatures are each defined once and consumed unchanged by their respective Server Action. `toCents`/`fromCents` from Tier 1's `money.ts` are reused throughout, same convention.
- **Known simplification:** chore period timing uses a fixed frequency→days mapping rather than calendar-aware scheduling (e.g. "every Monday"); AI query context includes expenses and chores but not availability/proposals — acceptable for the demo scope, extendable later without changing the pattern.
