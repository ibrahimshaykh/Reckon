# Tier 1 — Groups, Manual Expenses, Settlement Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A working vertical slice of Tier 1 features #1 (who-owes-who), #3 (one-tap settle-up), and #4 (show-the-math) — group creation, manual expense entry, debt-minimization settlement, and payment deep links. AI receipt reading (#2's photo path) is its own follow-up plan; manual entry already satisfies #2's "or manual entry" fallback.

**Architecture:** Server Actions (not API routes) for all mutations, called directly from Client Components — this app has no external API consumers. Money is handled as integer cents in all logic; `Decimal(10,2)` only at the DB boundary. The settlement algorithm is a pure function with no DB access, so it can be verified by hand with a script before it's wired into a page.

**Tech Stack:** Next.js 16 Server Actions, Prisma 7, `Decimal.js` (via `@prisma/client`'s `Decimal` re-export) for DB-boundary conversion, shadcn/ui (Base UI) for forms.

## Global Constraints

- Money is never a float: `Decimal` in the DB, integer cents in logic. Uneven splits assign the remainder to the last participant.
- Every debt/settlement result must carry an `explanation` (JSON) so the UI can show its own math (spec feature #4).
- $0 budget — no payment processor; settle-up is a deep link only.
- Route protection happens in the DAL / inside each Server Action via `requireSession()`, never in `proxy.ts`.

---

### Task 1: Groups data layer + Server Actions

**Files:**
- Create: `src/lib/actions/groups.ts`
- Create: `src/lib/money.ts`

**Interfaces:**
- Consumes: `requireSession()`, `db` from Foundation.
- Produces: `createGroup(name: string)`, `addMemberByEmail(groupId: string, email: string)`, `listMyGroups()`, `getGroup(groupId: string)` — all Server Actions returning plain objects (no Decimal/Date serialization issues across the RSC boundary). `toCents(decimal)`, `fromCents(cents)` in `money.ts`.

- [ ] **Step 1** — `src/lib/money.ts`:

```ts
import { Prisma } from "@/generated/prisma/client";

export function toCents(amount: Prisma.Decimal | number): number {
  const value = typeof amount === "number" ? amount : Number(amount);
  return Math.round(value * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}
```

- [ ] **Step 2** — `src/lib/actions/groups.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";

export async function createGroup(name: string) {
  const session = await requireSession();
  if (!name.trim()) throw new ApiError(400, "Group name is required.");

  const group = await db.group.create({
    data: {
      name: name.trim(),
      createdById: session.id,
      members: { create: { userId: session.id } },
    },
  });

  revalidatePath("/groups");
  return { id: group.id, name: group.name };
}

export async function addMemberByEmail(groupId: string, email: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const user = await db.user.findUnique({ where: { email: email.trim() } });
  if (!user) {
    throw new ApiError(
      404,
      "No Reckon account with that email yet — ask them to sign up first.",
    );
  }

  const existing = await db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
  });
  if (existing) throw new ApiError(409, "Already a member of this group.");

  await db.groupMember.create({ data: { groupId, userId: user.id } });
  revalidatePath(`/groups/${groupId}`);
  return { id: user.id, displayName: user.displayName, email: user.email };
}

export async function listMyGroups() {
  const session = await requireSession();
  const memberships = await db.groupMember.findMany({
    where: { userId: session.id },
    include: { group: true },
    orderBy: { group: { createdAt: "desc" } },
  });
  return memberships.map((m) => ({ id: m.group.id, name: m.group.name }));
}

export async function getGroup(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const group = await db.group.findUniqueOrThrow({
    where: { id: groupId },
    include: { members: { include: { user: true } } },
  });

  return {
    id: group.id,
    name: group.name,
    members: group.members.map((m) => ({
      id: m.user.id,
      displayName: m.user.displayName,
      email: m.user.email,
    })),
  };
}

export async function assertMember(groupId: string, userId: string) {
  const membership = await db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) throw new ApiError(403, "Not a member of this group.");
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean.

- [ ] **Step 4: Commit** — `feat: group creation, membership, Server Actions`.

---

### Task 2: Group pages (list, create, detail)

**Files:**
- Create: `src/app/groups/page.tsx`, `src/app/groups/new/page.tsx`, `src/app/groups/[groupId]/page.tsx`
- Create: `src/components/groups/create-group-form.tsx`, `src/components/groups/add-member-form.tsx`

**Interfaces:**
- Consumes: `createGroup`, `addMemberByEmail`, `listMyGroups`, `getGroup` from Task 1.

- [ ] **Step 1** — `src/components/groups/create-group-form.tsx` (Client Component, calls `createGroup`, redirects on success via `useRouter`):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGroup } from "@/lib/actions/groups";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CreateGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const group = await createGroup(name);
      router.push(`/groups/${group.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 max-w-sm">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. The Apartment"
        required
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create group"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2** — `src/components/groups/add-member-form.tsx` (same pattern, calls `addMemberByEmail(groupId, email)`, calls `router.refresh()` on success instead of redirecting):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addMemberByEmail } from "@/lib/actions/groups";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AddMemberForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await addMemberByEmail(groupId, email);
      setEmail("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="friend@example.com"
        required
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3** — `src/app/groups/page.tsx`:

```tsx
import Link from "next/link";
import { listMyGroups } from "@/lib/actions/groups";
import { Button } from "@/components/ui/button";

export default async function GroupsPage() {
  const groups = await listMyGroups();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your groups</h1>
        <Button render={<Link href="/groups/new" />} nativeButton={false}>
          New group
        </Button>
      </div>
      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No groups yet — create one to start splitting expenses.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {groups.map((group) => (
          <li key={group.id}>
            <Link
              href={`/groups/${group.id}`}
              className="block rounded-lg border p-3 hover:bg-muted"
            >
              {group.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4** — `src/app/groups/new/page.tsx`:

```tsx
import { CreateGroupForm } from "@/components/groups/create-group-form";

export default function NewGroupPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">New group</h1>
      <CreateGroupForm />
    </div>
  );
}
```

- [ ] **Step 5** — `src/app/groups/[groupId]/page.tsx`:

```tsx
import { getGroup } from "@/lib/actions/groups";
import { AddMemberForm } from "@/components/groups/add-member-form";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const group = await getGroup(groupId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{group.name}</h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Members</h2>
        <ul className="flex flex-col gap-1">
          {group.members.map((m) => (
            <li key={m.id} className="text-sm">
              {m.displayName} ({m.email})
            </li>
          ))}
        </ul>
        <AddMemberForm groupId={group.id} />
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Verify live** — dev server, sign in, create a group, add a second member by email (use the seeded test account's email or a second real account), confirm the member list updates.

- [ ] **Step 7: Commit** — `feat: group list, create, and detail pages`.

---

### Task 3: Manual expense entry

**Files:**
- Create: `src/lib/actions/expenses.ts`
- Create: `src/app/groups/[groupId]/expenses/new/page.tsx`
- Create: `src/components/expenses/add-expense-form.tsx`
- Modify: `src/app/groups/[groupId]/page.tsx` (list expenses + link to add)

**Interfaces:**
- Consumes: `assertMember`, `toCents`/`fromCents`, `requireSession`.
- Produces: `addManualExpense(input: { groupId, title, totalCents, paidById, participantIds, splitType, customCents? })`, `listGroupExpenses(groupId)`.

- [ ] **Step 1** — `src/lib/actions/expenses.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/dal";
import { assertMember } from "@/lib/actions/groups";
import { ApiError } from "@/lib/api-error";
import { fromCents } from "@/lib/money";

type AddManualExpenseInput = {
  groupId: string;
  title: string;
  totalCents: number;
  paidById: string;
  participantIds: string[];
  splitType: "EQUAL" | "CUSTOM";
  customCents?: Record<string, number>;
};

export async function addManualExpense(input: AddManualExpenseInput) {
  const session = await requireSession();
  await assertMember(input.groupId, session.id);

  if (!input.title.trim()) throw new ApiError(400, "Title is required.");
  if (input.totalCents <= 0) throw new ApiError(400, "Amount must be positive.");
  if (input.participantIds.length === 0) {
    throw new ApiError(400, "Pick at least one participant.");
  }

  const shares = splitToShareRatios(
    input.totalCents,
    input.participantIds,
    input.splitType,
    input.customCents,
  );

  await db.expense.create({
    data: {
      groupId: input.groupId,
      paidById: input.paidById,
      title: input.title.trim(),
      totalAmount: fromCents(input.totalCents),
      source: "MANUAL",
      items: {
        create: {
          label: input.title.trim(),
          amount: fromCents(input.totalCents),
          splitType: input.splitType,
          participants: {
            create: input.participantIds.map((userId) => ({
              userId,
              shareRatio: shares[userId],
            })),
          },
        },
      },
    },
  });

  revalidatePath(`/groups/${input.groupId}`);
}

// Ratios (not raw cents) are what's stored, since the schema's
// ExpenseItemParticipant.shareRatio is what the settlement engine reads —
// storing ratios keeps the item re-splittable if the total is ever edited.
function splitToShareRatios(
  totalCents: number,
  participantIds: string[],
  splitType: "EQUAL" | "CUSTOM",
  customCents?: Record<string, number>,
): Record<string, number> {
  if (splitType === "EQUAL") {
    const ratio = 1 / participantIds.length;
    const shares: Record<string, number> = {};
    participantIds.forEach((id) => (shares[id] = ratio));
    return shares;
  }

  if (!customCents) throw new ApiError(400, "Custom split requires amounts.");
  const sum = participantIds.reduce((s, id) => s + (customCents[id] ?? 0), 0);
  if (sum !== totalCents) {
    throw new ApiError(
      400,
      `Custom amounts (${sum} cents) must add up to the total (${totalCents} cents).`,
    );
  }
  const shares: Record<string, number> = {};
  participantIds.forEach((id) => (shares[id] = (customCents[id] ?? 0) / totalCents));
  return shares;
}

export async function listGroupExpenses(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const expenses = await db.expense.findMany({
    where: { groupId },
    include: { paidBy: true },
    orderBy: { createdAt: "desc" },
  });

  return expenses.map((e) => ({
    id: e.id,
    title: e.title,
    totalAmount: Number(e.totalAmount),
    paidByName: e.paidBy.displayName,
    createdAt: e.createdAt.toISOString(),
  }));
}
```

- [ ] **Step 2** — `src/components/expenses/add-expense-form.tsx` (equal-split only in the UI for this task; the action already supports custom for Task 4/5 reuse):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addManualExpense } from "@/lib/actions/expenses";
import { toCents } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Member = { id: string; displayName: string };

export function AddExpenseForm({
  groupId,
  members,
  currentUserId,
}: {
  groupId: string;
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [paidById, setPaidById] = useState(currentUserId);
  const [participantIds, setParticipantIds] = useState<string[]>(
    members.map((m) => m.id),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleParticipant(id: string) {
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await addManualExpense({
        groupId,
        title,
        totalCents: toCents(Number(amount)),
        paidById,
        participantIds,
        splitType: "EQUAL",
      });
      router.push(`/groups/${groupId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 max-w-sm">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Groceries"
        required
      />
      <Input
        type="number"
        step="0.01"
        min="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0.00"
        required
      />
      <label className="text-sm text-muted-foreground">Paid by</label>
      <select
        className="rounded-md border bg-background p-2 text-sm"
        value={paidById}
        onChange={(e) => setPaidById(e.target.value)}
      >
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName}
          </option>
        ))}
      </select>
      <label className="text-sm text-muted-foreground">Split between</label>
      <div className="flex flex-col gap-1">
        {members.map((m) => (
          <label key={m.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={participantIds.includes(m.id)}
              onCheckedChange={() => toggleParticipant(m.id)}
            />
            {m.displayName}
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add expense"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3** — `src/app/groups/[groupId]/expenses/new/page.tsx`:

```tsx
import { getGroup } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { AddExpenseForm } from "@/components/expenses/add-expense-form";

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [group, session] = await Promise.all([
    getGroup(groupId),
    requireSession(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Add expense to {group.name}</h1>
      <AddExpenseForm
        groupId={group.id}
        members={group.members}
        currentUserId={session.id}
      />
    </div>
  );
}
```

- [ ] **Step 4** — modify `src/app/groups/[groupId]/page.tsx`: add an expense list section and an "Add expense" link, using `listGroupExpenses`.

- [ ] **Step 5: Verify live** — dev server, add an expense with an equal split across 2 members, confirm it appears in the group's expense list with the right amount and payer.

- [ ] **Step 6: Commit** — `feat: manual expense entry with equal/custom splits`.

---

### Task 4: Settlement algorithm (pure function)

**Files:**
- Create: `src/lib/settlement.ts`
- Create: `scripts/verify-settlement.ts` (throwaway verification script, not committed — see Step 3)

**Interfaces:**
- Consumes: nothing (pure function, no DB).
- Produces: `computeSettlements(balances: Record<string, number>): SettlementResult[]` where `SettlementResult = { fromUserId, toUserId, amountCents, explanation }`. `explanation` is a JSON-serializable object listing the steps (greedy max-creditor/max-debtor matches).

- [ ] **Step 1** — `src/lib/settlement.ts`:

```ts
export type SettlementResult = {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  explanation: {
    steps: string[];
  };
};

// Greedy debt minimization: repeatedly match the largest creditor against
// the largest debtor until every balance is zero. This is the standard
// minimum-transaction heuristic — not always the mathematically fewest
// possible transfers in pathological cases, but always correct (every
// balance clears) and always explainable step by step.
export function computeSettlements(
  balances: Record<string, number>,
): SettlementResult[] {
  const entries = Object.entries(balances).filter(([, cents]) => cents !== 0);

  const creditors = entries
    .filter(([, cents]) => cents > 0)
    .map(([userId, cents]) => ({ userId, cents }))
    .sort((a, b) => b.cents - a.cents);
  const debtors = entries
    .filter(([, cents]) => cents < 0)
    .map(([userId, cents]) => ({ userId, cents: -cents }))
    .sort((a, b) => b.cents - a.cents);

  const results: SettlementResult[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.cents, debtor.cents);

    if (amount > 0) {
      results.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amountCents: amount,
        explanation: {
          steps: [
            `${debtor.userId} owes ${(debtor.cents / 100).toFixed(2)} total.`,
            `${creditor.userId} is owed ${(creditor.cents / 100).toFixed(2)} total.`,
            `Matched the largest debtor against the largest creditor for ${(amount / 100).toFixed(2)}.`,
          ],
        },
      });
    }

    creditor.cents -= amount;
    debtor.cents -= amount;
    if (creditor.cents === 0) ci++;
    if (debtor.cents === 0) di++;
  }

  return results;
}

// Net balance per user across a group's expenses: what they paid for others
// minus what they owe for their own share. Positive = owed money (creditor).
export function computeBalances(
  expenses: {
    paidById: string;
    totalCents: number;
    participants: { userId: string; shareRatio: number }[];
  }[],
): Record<string, number> {
  const balances: Record<string, number> = {};

  for (const expense of expenses) {
    balances[expense.paidById] =
      (balances[expense.paidById] ?? 0) + expense.totalCents;

    const shareCents = splitEvenlyByRatio(
      expense.totalCents,
      expense.participants,
    );
    for (const [userId, cents] of Object.entries(shareCents)) {
      balances[userId] = (balances[userId] ?? 0) - cents;
    }
  }

  return balances;
}

// Converts ratios back to exact cents, giving the leftover penny (from
// rounding) to the last participant so the sum always equals totalCents.
function splitEvenlyByRatio(
  totalCents: number,
  participants: { userId: string; shareRatio: number }[],
): Record<string, number> {
  const shares: Record<string, number> = {};
  let allocated = 0;

  participants.forEach((p, i) => {
    if (i === participants.length - 1) {
      shares[p.userId] = totalCents - allocated;
    } else {
      const cents = Math.round(totalCents * p.shareRatio);
      shares[p.userId] = cents;
      allocated += cents;
    }
  });

  return shares;
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean.

- [ ] **Step 3: Verify by hand** — create `scripts/verify-settlement.ts` with 3 hand-computed cases (3-way equal split, uneven $10/3 split, a case with 2 creditors and 2 debtors), run with `npx tsx scripts/verify-settlement.ts`, confirm printed output matches hand math, then delete the script (it's a one-off check, not part of the app).

- [ ] **Step 4: Commit** — `feat: debt-minimization settlement algorithm`.

---

### Task 5: Settlement page + one-tap settle-up

**Files:**
- Create: `src/lib/actions/settlements.ts`
- Create: `src/app/groups/[groupId]/settle/page.tsx`
- Create: `src/components/settlements/settlement-list.tsx`
- Create: `src/lib/pay-links.ts`

**Interfaces:**
- Consumes: `computeBalances`, `computeSettlements` from Task 4; `assertMember`.
- Produces: `getGroupSettlements(groupId)` (computes live, does not persist — persistence + status tracking is Tier 3's two-way confirmation feature), `buildPayLink(provider, { toHandle, amountCents, note })`.

- [ ] **Step 1** — `src/lib/pay-links.ts`:

```ts
export type PayProvider = "venmo" | "paypal" | "cashapp";

export function buildPayLink(
  provider: PayProvider,
  input: { handle: string; amountCents: number; note: string },
): string {
  const amount = (input.amountCents / 100).toFixed(2);
  const handle = input.handle.replace(/^[@$]/, "");

  switch (provider) {
    case "venmo":
      return `https://venmo.com/${handle}?txn=pay&amount=${amount}&note=${encodeURIComponent(input.note)}`;
    case "paypal":
      return `https://paypal.me/${handle}/${amount}`;
    case "cashapp":
      return `https://cash.app/$${handle}/${amount}`;
  }
}
```

- [ ] **Step 2** — `src/lib/actions/settlements.ts`:

```ts
"use server";

import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { toCents } from "@/lib/money";
import { computeBalances, computeSettlements } from "@/lib/settlement";

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
  const settlements = computeSettlements(balances);

  const userIds = [...new Set(settlements.flatMap((s) => [s.fromUserId, s.toUserId]))];
  const users = await db.user.findMany({ where: { id: { in: userIds } } });
  const nameOf = (id: string) => users.find((u) => u.id === id)?.displayName ?? id;

  return settlements.map((s) => ({
    ...s,
    fromName: nameOf(s.fromUserId),
    toName: nameOf(s.toUserId),
  }));
}
```

- [ ] **Step 3** — `src/components/settlements/settlement-list.tsx` (Client Component: renders each settlement, an expandable "show the math" using the `explanation.steps`, and pay-link buttons that prompt for a handle via a small inline input before opening `buildPayLink`):

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildPayLink, type PayProvider } from "@/lib/pay-links";

type Settlement = {
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  amountCents: number;
  explanation: { steps: string[] };
};

export function SettlementList({
  settlements,
  currentUserId,
}: {
  settlements: Settlement[];
  currentUserId: string;
}) {
  if (settlements.length === 0) {
    return <p className="text-sm text-muted-foreground">Everyone&apos;s settled up.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {settlements.map((s, i) => (
        <SettlementRow key={i} settlement={s} currentUserId={currentUserId} />
      ))}
    </ul>
  );
}

function SettlementRow({
  settlement,
  currentUserId,
}: {
  settlement: Settlement;
  currentUserId: string;
}) {
  const [showMath, setShowMath] = useState(false);
  const [handle, setHandle] = useState("");

  const amount = (settlement.amountCents / 100).toFixed(2);
  const isPayer = settlement.fromUserId === currentUserId;

  function pay(provider: PayProvider) {
    if (!handle.trim()) return;
    const url = buildPayLink(provider, {
      handle,
      amountCents: settlement.amountCents,
      note: `Reckon settle-up`,
    });
    window.open(url, "_blank");
  }

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm">
          <strong>{settlement.fromName}</strong> owes{" "}
          <strong>{settlement.toName}</strong> ${amount}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setShowMath((v) => !v)}>
          {showMath ? "Hide math" : "Show the math"}
        </Button>
      </div>
      {showMath && (
        <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
          {settlement.explanation.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ul>
      )}
      {isPayer && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@their-handle"
            className="max-w-40"
          />
          <Button size="sm" onClick={() => pay("venmo")}>Venmo</Button>
          <Button size="sm" onClick={() => pay("paypal")}>PayPal</Button>
          <Button size="sm" onClick={() => pay("cashapp")}>Cash App</Button>
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 4** — `src/app/groups/[groupId]/settle/page.tsx`:

```tsx
import { getGroupSettlements } from "@/lib/actions/settlements";
import { requireSession } from "@/lib/dal";
import { SettlementList } from "@/components/settlements/settlement-list";

export default async function SettlePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [settlements, session] = await Promise.all([
    getGroupSettlements(groupId),
    requireSession(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Who owes who</h1>
      <SettlementList settlements={settlements} currentUserId={session.id} />
    </div>
  );
}
```

- [ ] **Step 5: Verify live** — dev server, with the expense from Task 3 already added, visit `/groups/[id]/settle`, confirm the correct debtor/creditor pair and amount show, expand "show the math", click a pay-link button and confirm it opens the correct provider URL with the right amount.

- [ ] **Step 6: Commit** — `feat: settlement page with show-the-math and pay links`.

---

## Self-Review

- **Spec coverage:** #1 (who-owes-who) — Task 4/5. #3 (one-tap settle-up) — Task 5's pay links. #4 (show-the-math) — every `SettlementResult.explanation` + the UI toggle. #2 (AI receipt reading) is deferred to a follow-up plan; manual entry (Task 3) covers its fallback path per the spec's own wording.
- **Placeholders:** none — every step has concrete code.
- **Type consistency:** `computeBalances`/`computeSettlements` signatures match between Task 4 (definition) and Task 5 (consumption). `toCents`/`fromCents` from Task 1 are reused in Tasks 3 and 5.
- **Known simplification:** settlements are computed live, not persisted to the `Settlement` table yet — persistence, nudges, and two-way confirmation are Tier 3 features (#9, #10) that build on this same `computeSettlements` output.
