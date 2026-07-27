# Week Availability Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain text "submit a datetime range, read a list of overlap windows" availability UI with a visual week-grid calendar: each member's free time renders as a translucent colored bar on a dark canvas, drag-to-select adds a new block, and overlapping colors screen-blend into a brighter glow — so the group's shared free time is something you see happening, not something you read off a list.

**Architecture:** No schema changes — `AvailabilityEntry` already has everything needed (`userId`, `startsAt`, `endsAt`). A new pure module (`src/lib/availability-grid.ts`) handles the date/color math (week generation, clipping an entry across day boundaries, dynamic hour-range sizing, deterministic per-user color assignment) and is unit tested like the rest of `src/lib`. The existing `getGroupFreeTime` read action grows to also return raw per-user entries (it already computes the overlap windows from the same query, so this is one extra field, not a new query). A new `removeAvailability` action lets a member delete their own entry, since the interactive grid makes accidental entries much easier to create than the old form did. The grid itself is one client component using native pointer events for drag — no new dependency.

**Tech Stack:** Plain React state + pointer events, Tailwind `mix-blend-screen`, existing shadcn `Button`, native `Date` arithmetic (no date library is installed or needed).

## Global Constraints

- No new npm dependencies — this app currently has no animation/calendar/date library installed, and none is needed for this feature.
- Every new pure function goes in a testable module (`src/lib/availability-grid.ts`), matching the existing convention (`src/lib/settlement.ts`, `src/lib/availability.ts`, etc. are all pure and unit tested).
- Ownership checks on mutations follow the existing pattern (`markPaid`/`confirmReceived` compare `session.id` against the row's owning user).

---

### Task 1: Pure grid helpers + tests

**Files:**
- Create: `src/lib/availability-grid.ts`
- Create: `src/lib/__tests__/availability-grid.test.ts`

**Interfaces:**
- Produces: `getWeekDays(weekOffset: number, now: Date): Date[]` (7 local-midnight `Date`s), `splitEntryByDay(entry: {start:number,end:number}, days: Date[]): Segment[]` where `Segment = {dayIndex:number, startMinute:number, endMinute:number}`, `computeHourRange(entries: {start:number,end:number}[], days: Date[], defaultStartHour?=8, defaultEndHour?=22): {startHour:number, endHour:number}`, `assignColors(userIds: string[]): Record<string, {bar:string, dot:string}>`. Consumed by Tasks 3 and 4.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/availability-grid.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  getWeekDays,
  splitEntryByDay,
  computeHourRange,
  assignColors,
} from "@/lib/availability-grid";

describe("getWeekDays", () => {
  it("returns 7 consecutive local-midnight days starting today for offset 0", () => {
    const now = new Date(2026, 6, 27, 15, 30);
    const days = getWeekDays(0, now);
    expect(days).toHaveLength(7);
    expect(days[0].getDate()).toBe(27);
    expect(days[0].getHours()).toBe(0);
    expect(days[6].getDate()).toBe(2);
  });

  it("shifts by 7 days per week offset", () => {
    const now = new Date(2026, 6, 27);
    const days = getWeekDays(1, now);
    expect(days[0].getDate()).toBe(3);
  });
});

describe("splitEntryByDay", () => {
  const days = getWeekDays(0, new Date(2026, 6, 27));

  it("keeps a same-day entry in a single segment", () => {
    const day0 = days[0].getTime();
    const segments = splitEntryByDay(
      { start: day0 + 9 * 3600_000, end: day0 + 17 * 3600_000 },
      days,
    );
    expect(segments).toEqual([{ dayIndex: 0, startMinute: 540, endMinute: 1020 }]);
  });

  it("splits an entry that spans midnight into two day segments", () => {
    const day0 = days[0].getTime();
    const segments = splitEntryByDay(
      { start: day0 + 22 * 3600_000, end: day0 + 26 * 3600_000 },
      days,
    );
    expect(segments).toEqual([
      { dayIndex: 0, startMinute: 1320, endMinute: 1440 },
      { dayIndex: 1, startMinute: 0, endMinute: 120 },
    ]);
  });

  it("drops segments entirely outside the displayed week", () => {
    const farFuture = days[6].getTime() + 10 * 24 * 3600_000;
    const segments = splitEntryByDay({ start: farFuture, end: farFuture + 3600_000 }, days);
    expect(segments).toEqual([]);
  });
});

describe("computeHourRange", () => {
  const days = getWeekDays(0, new Date(2026, 6, 27));

  it("defaults to 8am-10pm when there are no entries", () => {
    expect(computeHourRange([], days)).toEqual({ startHour: 8, endHour: 22 });
  });

  it("expands to fit an entry outside the default range", () => {
    const day0 = days[0].getTime();
    const entries = [{ start: day0 + 6 * 3600_000, end: day0 + 23 * 3600_000 }];
    expect(computeHourRange(entries, days)).toEqual({ startHour: 6, endHour: 23 });
  });
});

describe("assignColors", () => {
  it("assigns a stable, distinct color per user", () => {
    const colors = assignColors(["a", "b", "c"]);
    expect(colors.a).toEqual(colors.a);
    expect(colors.a).not.toEqual(colors.b);
  });

  it("wraps around the palette for groups larger than the palette", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `user${i}`);
    const colors = assignColors(ids);
    expect(colors.user0).toEqual(colors.user8);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/availability-grid.test.ts`
Expected: FAIL — `Cannot find module '@/lib/availability-grid'`.

- [ ] **Step 3: Implement `src/lib/availability-grid.ts`**

```ts
const DAY_MS = 24 * 60 * 60 * 1000;

// "This week" means the next 7 days starting today, not a Mon–Sun calendar
// week — closer to how a friend group actually plans ("what's everyone free
// this coming week") and avoids locale week-start bikeshedding.
export function getWeekDays(weekOffset: number, now: Date): Date[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY_MS));
}

export type Segment = { dayIndex: number; startMinute: number; endMinute: number };

// Clips a single [start,end) interval (epoch ms) to the portion(s) that fall
// within each of the displayed days, in minutes-since-midnight — an entry
// that spans midnight becomes one segment per day it touches.
export function splitEntryByDay(
  entry: { start: number; end: number },
  days: Date[],
): Segment[] {
  const segments: Segment[] = [];
  days.forEach((day, dayIndex) => {
    const dayStart = day.getTime();
    const dayEnd = dayStart + DAY_MS;
    const start = Math.max(entry.start, dayStart);
    const end = Math.min(entry.end, dayEnd);
    if (start < end) {
      segments.push({
        dayIndex,
        startMinute: (start - dayStart) / 60_000,
        endMinute: (end - dayStart) / 60_000,
      });
    }
  });
  return segments;
}

// Expands the visible hour range to fit every entry, so nothing submitted
// outside the default 8am–10pm window gets silently clipped from view.
export function computeHourRange(
  entries: { start: number; end: number }[],
  days: Date[],
  defaultStartHour = 8,
  defaultEndHour = 22,
): { startHour: number; endHour: number } {
  let startHour = defaultStartHour;
  let endHour = defaultEndHour;
  for (const entry of entries) {
    for (const seg of splitEntryByDay(entry, days)) {
      startHour = Math.min(startHour, Math.floor(seg.startMinute / 60));
      endHour = Math.max(endHour, Math.ceil(seg.endMinute / 60));
    }
  }
  return { startHour, endHour };
}

const PALETTE = [
  { bar: "bg-rose-500/70", dot: "bg-rose-500" },
  { bar: "bg-sky-500/70", dot: "bg-sky-500" },
  { bar: "bg-amber-400/70", dot: "bg-amber-400" },
  { bar: "bg-emerald-500/70", dot: "bg-emerald-500" },
  { bar: "bg-violet-500/70", dot: "bg-violet-500" },
  { bar: "bg-fuchsia-500/70", dot: "bg-fuchsia-500" },
  { bar: "bg-lime-500/70", dot: "bg-lime-500" },
  { bar: "bg-cyan-500/70", dot: "bg-cyan-500" },
];

// Deterministic by first-seen order, so a member's color stays stable
// across renders without needing to persist anything.
export function assignColors(userIds: string[]): Record<string, { bar: string; dot: string }> {
  const colors: Record<string, { bar: string; dot: string }> = {};
  userIds.forEach((id, i) => {
    colors[id] = PALETTE[i % PALETTE.length];
  });
  return colors;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/availability-grid.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/availability-grid.ts src/lib/__tests__/availability-grid.test.ts
git commit -m "feat: add pure week-grid date/color helpers for availability calendar"
```

---

### Task 2: Extend `getGroupFreeTime`, add `removeAvailability`

**Files:**
- Modify: `src/lib/actions/availability.ts`

**Interfaces:**
- Produces: `getGroupFreeTime(groupId): Promise<{respondedCount, windows, entries: {id,userId,startsAt,endsAt,label}[]}>` (adds `entries` to the existing return — `windows`/`respondedCount` shape is unchanged, so the current `FreeTimeList` consumer keeps working). `removeAvailability(entryId: string): Promise<void>` — new export, consumed by Task 3.

- [ ] **Step 1: Add `entries` to `getGroupFreeTime`'s return**

In `src/lib/actions/availability.ts`, replace the `return` statement of `getGroupFreeTime` with:

```ts
  return {
    respondedCount,
    windows: freeWindows.map((w) => ({
      startsAt: new Date(w.start).toISOString(),
      endsAt: new Date(w.end).toISOString(),
    })),
    entries: entries.map((e) => ({
      id: e.id,
      userId: e.userId,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      label: e.label,
    })),
  };
```

- [ ] **Step 2: Add `removeAvailability`**

Add after `getGroupFreeTime`:

```ts
export async function removeAvailability(entryId: string) {
  const session = await requireSession();
  const entry = await db.availabilityEntry.findUniqueOrThrow({ where: { id: entryId } });
  if (entry.userId !== session.id) {
    throw new ApiError(403, "You can only remove your own availability.");
  }
  await db.availabilityEntry.delete({ where: { id: entryId } });
  revalidatePath(`/groups/${entry.groupId}/availability`);
}
```

- [ ] **Step 3: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all tests still pass (the existing `availability.test.ts` tests the pure `findGroupFreeTime` function, untouched).

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/availability.ts
git commit -m "feat: return raw availability entries and support removing them"
```

---

### Task 3: `WeekGrid` interactive component

**Files:**
- Create: `src/components/availability/week-grid.tsx`

**Interfaces:**
- Consumes: `getWeekDays`, `splitEntryByDay`, `computeHourRange`, `assignColors` from `src/lib/availability-grid.ts` (Task 1); `addAvailability`, `removeAvailability` from `src/lib/actions/availability.ts` (Task 2, `addAvailability` already existed before this plan).
- Produces: `WeekGrid` component, consumed by Task 4's page.

- [ ] **Step 1: Create `src/components/availability/week-grid.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addAvailability, removeAvailability } from "@/lib/actions/availability";
import { getWeekDays, splitEntryByDay, computeHourRange, assignColors } from "@/lib/availability-grid";
import { Button } from "@/components/ui/button";

type Member = { id: string; displayName: string };
type Entry = { id: string; userId: string; startsAt: string; endsAt: string; label: string | null };

const HOUR_PX = 48;

export function WeekGrid({
  groupId,
  weekOffset,
  members,
  entries,
  currentUserId,
}: {
  groupId: string;
  weekOffset: number;
  members: Member[];
  entries: Entry[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [drag, setDrag] = useState<{ dayIndex: number; startMinute: number; currentMinute: number } | null>(
    null,
  );

  const days = useMemo(() => getWeekDays(weekOffset, new Date()), [weekOffset]);
  const colors = useMemo(() => assignColors(members.map((m) => m.id)), [members]);
  const entryIntervals = useMemo(
    () => entries.map((e) => ({ start: new Date(e.startsAt).getTime(), end: new Date(e.endsAt).getTime() })),
    [entries],
  );
  const { startHour, endHour } = useMemo(
    () => computeHourRange(entryIntervals, days),
    [entryIntervals, days],
  );
  const totalMinutes = (endHour - startHour) * 60;
  const gridHeight = (endHour - startHour) * HOUR_PX;

  function minuteFromPointer(clientY: number, columnEl: HTMLElement) {
    const rect = columnEl.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const minute = startHour * 60 + ratio * totalMinutes;
    return Math.round(minute / 15) * 15;
  }

  function onPointerDown(dayIndex: number, e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const minute = minuteFromPointer(e.clientY, e.currentTarget);
    setDrag({ dayIndex, startMinute: minute, currentMinute: minute });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const minute = minuteFromPointer(e.clientY, e.currentTarget);
    setDrag({ ...drag, currentMinute: minute });
  }

  async function onPointerUp() {
    if (!drag) return;
    const lo = Math.min(drag.startMinute, drag.currentMinute);
    const hi = Math.max(drag.startMinute, drag.currentMinute);
    setDrag(null);
    if (hi - lo < 15) return;

    const day = days[drag.dayIndex];
    const startsAt = new Date(day.getTime() + lo * 60_000);
    const endsAt = new Date(day.getTime() + hi * 60_000);
    setPending(true);
    await addAvailability({ groupId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    setPending(false);
    router.refresh();
  }

  async function onRemove(entryId: string) {
    setPending(true);
    await removeAvailability(entryId);
    setPending(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push(`/groups/${groupId}/availability?week=${weekOffset - 1}`)}
        >
          ← Previous week
        </Button>
        <p className="text-sm text-muted-foreground">
          {days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} –{" "}
          {days[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push(`/groups/${groupId}/availability?week=${weekOffset + 1}`)}
        >
          Next week →
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`h-2.5 w-2.5 rounded-full ${colors[m.id].dot}`} />
            {m.displayName}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-neutral-950">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[3rem_repeat(7,1fr)] text-xs">
            <div />
            {days.map((day, i) => (
              <div
                key={i}
                className="border-b border-neutral-800 py-1.5 text-center font-medium text-neutral-200"
              >
                {day.toLocaleDateString(undefined, { weekday: "short" })}
                <br />
                <span className="font-mono text-neutral-500">{day.getDate()}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[3rem_repeat(7,1fr)]">
            <div className="relative" style={{ height: gridHeight }}>
              {Array.from({ length: endHour - startHour }, (_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 -translate-y-1/2 pr-2 text-right font-mono text-[10px] text-neutral-500"
                  style={{ top: i * HOUR_PX }}
                >
                  {String(startHour + i).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {days.map((day, dayIndex) => (
              <div
                key={dayIndex}
                className="relative touch-none border-l border-neutral-800"
                style={{ height: gridHeight }}
                onPointerDown={(e) => onPointerDown(dayIndex, e)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                {Array.from({ length: endHour - startHour }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-neutral-900"
                    style={{ top: i * HOUR_PX }}
                  />
                ))}

                {entries.flatMap((entry) =>
                  splitEntryByDay(
                    { start: new Date(entry.startsAt).getTime(), end: new Date(entry.endsAt).getTime() },
                    days,
                  )
                    .filter((seg) => seg.dayIndex === dayIndex)
                    .map((seg, i) => (
                      <div
                        key={`${entry.id}-${i}`}
                        className={`absolute left-0.5 right-0.5 rounded-sm ${colors[entry.userId].bar} mix-blend-screen ${
                          entry.userId === currentUserId ? "cursor-pointer" : "pointer-events-none"
                        }`}
                        style={{
                          top: (seg.startMinute - startHour * 60) * (HOUR_PX / 60),
                          height: Math.max(4, (seg.endMinute - seg.startMinute) * (HOUR_PX / 60)),
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => entry.userId === currentUserId && onRemove(entry.id)}
                        title={entry.userId === currentUserId ? "Click to remove" : undefined}
                      />
                    )),
                )}

                {drag?.dayIndex === dayIndex && (
                  <div
                    className="absolute left-0.5 right-0.5 rounded-sm bg-white/40"
                    style={{
                      top: (Math.min(drag.startMinute, drag.currentMinute) - startHour * 60) * (HOUR_PX / 60),
                      height: Math.max(4, Math.abs(drag.currentMinute - drag.startMinute) * (HOUR_PX / 60)),
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {pending && <p className="text-xs text-muted-foreground">Saving…</p>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/availability/week-grid.tsx
git commit -m "feat: add interactive week-grid calendar for availability"
```

---

### Task 4: Wire up the availability page

**Files:**
- Modify: `src/app/groups/[groupId]/availability/page.tsx`
- Delete: `src/components/availability/add-availability-form.tsx` (superseded by drag-to-add on the grid)

**Interfaces:**
- Consumes: `getGroup` from `src/lib/actions/groups.ts` (existing, unchanged), `getGroupFreeTime` from `src/lib/actions/availability.ts` (Task 2), `requireSession` from `src/lib/dal.ts` (existing), `WeekGrid` from Task 3, `FreeTimeList` from `src/components/availability/free-time-list.tsx` (existing, unchanged).

- [ ] **Step 1: Replace the page**

Replace the full contents of `src/app/groups/[groupId]/availability/page.tsx`:

```tsx
import { getGroup } from "@/lib/actions/groups";
import { getGroupFreeTime } from "@/lib/actions/availability";
import { requireSession } from "@/lib/dal";
import { WeekGrid } from "@/components/availability/week-grid";
import { FreeTimeList } from "@/components/availability/free-time-list";
import { HelpTip } from "@/components/help-tip";

export default async function AvailabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { groupId } = await params;
  const { week } = await searchParams;
  const weekOffset = Number(week ?? 0) || 0;

  const [session, group, freeTime] = await Promise.all([
    requireSession(),
    getGroup(groupId),
    getGroupFreeTime(groupId),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Group availability</h1>
      <HelpTip text="Drag across the grid to mark yourself free. Where everyone's colors overlap, it glows brightest — that's when to plan something." />
      <WeekGrid
        groupId={groupId}
        weekOffset={weekOffset}
        members={group.members}
        entries={freeTime.entries}
        currentUserId={session.id}
      />
      <FreeTimeList respondedCount={freeTime.respondedCount} windows={freeTime.windows} />
    </div>
  );
}
```

- [ ] **Step 2: Delete the superseded form component**

Run: `rm src/components/availability/add-availability-form.tsx`

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (confirms nothing else imports the deleted form).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: replace availability form+list with the week-grid calendar"
```

---

### Task 5: Verification

**Files:** none — verification only.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the 10 new `availability-grid.test.ts` tests.

- [ ] **Step 2: Start the dev server and load the page**

Sign in, navigate to `/groups/<groupId>/availability`. Confirm the dark grid renders with day headers, hour labels, and the member-color legend.

- [ ] **Step 3: Drag to add availability**

Click-drag down a day column. Confirm a bar appears in your assigned color after the drag completes and the page refreshes, without a full navigation/reload.

- [ ] **Step 4: Verify multi-member overlap glow**

With at least two members' entries overlapping in time (seed a second entry directly if only one real account is available), confirm the overlapping region visibly brightens compared to either bar alone (`mix-blend-screen` compositing).

- [ ] **Step 5: Remove an entry**

Click one of your own bars. Confirm it disappears after the action completes. Confirm clicking another member's bar does nothing (no click handler fires — `pointer-events-none`).

- [ ] **Step 6: Week navigation**

Click "Next week →" and "← Previous week". Confirm the day headers/dates update accordingly and existing entries outside the shown week don't appear.
