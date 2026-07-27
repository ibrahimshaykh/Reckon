const DAY_MS = 24 * 60 * 60 * 1000;

// "This week" means 7 days starting from an explicit start date, not a
// Mon–Sun calendar week — closer to how a friend group actually plans, and
// lets the caller jump to any arbitrary start date (see parseDateParam).
export function getWeekDays(startDate: Date): Date[] {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  return Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY_MS));
}

// Serializes a Date to a plain YYYY-MM-DD string for the `?start=` URL param.
export function formatDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Parses a `?start=YYYY-MM-DD` param as a LOCAL midnight Date — deliberately
// not `new Date(value)`, which treats a bare date string as UTC midnight and
// would shift the displayed week by a day in any timezone ahead of UTC.
export function parseDateParam(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return fallback;
  const [, y, m, d] = match;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export type Segment = { dayIndex: number; startMinute: number; endMinute: number };
export type EntryLike = { start: number; end: number; recurring?: boolean };

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

// A recurring entry's stored start/end only carries a day-of-week and
// time-of-day "template" — it re-appears on every displayed day matching
// that day-of-week, at the same time-of-day, regardless of the literal
// stored date. A block that would cross midnight is truncated to the end of
// the day rather than spilling into the next day's row.
export function projectRecurringEntry(entry: { start: number; end: number }, days: Date[]): Segment[] {
  const origin = new Date(entry.start);
  const dayOfWeek = origin.getDay();
  const startMinuteOfDay = origin.getHours() * 60 + origin.getMinutes();
  const durationMinutes = (entry.end - entry.start) / 60_000;
  const segments: Segment[] = [];
  days.forEach((day, dayIndex) => {
    if (day.getDay() !== dayOfWeek) return;
    segments.push({
      dayIndex,
      startMinute: startMinuteOfDay,
      endMinute: Math.min(startMinuteOfDay + durationMinutes, 24 * 60),
    });
  });
  return segments;
}

// Single entry point every consumer (rendering, hour-range sizing, best-time
// detection) should use instead of calling splitEntryByDay directly, so
// recurring-vs-one-time dispatch lives in exactly one place.
export function getEntrySegments(entry: EntryLike, days: Date[]): Segment[] {
  return entry.recurring ? projectRecurringEntry(entry, days) : splitEntryByDay(entry, days);
}

// Expands the visible hour range to fit every entry, so nothing submitted
// outside the default 8am–10pm window gets silently clipped from view.
export function computeHourRange(
  entries: EntryLike[],
  days: Date[],
  defaultStartHour = 8,
  defaultEndHour = 22,
): { startHour: number; endHour: number } {
  let startHour = defaultStartHour;
  let endHour = defaultEndHour;
  for (const entry of entries) {
    for (const seg of getEntrySegments(entry, days)) {
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

function mergeMinuteSpans(spans: { start: number; end: number }[]): { start: number; end: number }[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

export type BestOverlap = { dayIndex: number; startMinute: number; endMinute: number; count: number };

// Finds the earliest, highest-attendance window across the displayed week —
// the concrete "so when should we actually hang out" answer, rather than
// making people scan the grid for the brightest patch themselves. Returns
// null if the best anyone can manage is one person alone (not worth
// announcing as a "plan" moment).
export function computeBestOverlap(
  entries: { userId: string; start: number; end: number; recurring?: boolean }[],
  days: Date[],
): BestOverlap | null {
  const segmentsByDayAndUser = new Map<number, Map<string, { start: number; end: number }[]>>();

  for (const entry of entries) {
    for (const seg of getEntrySegments(entry, days)) {
      let byUser = segmentsByDayAndUser.get(seg.dayIndex);
      if (!byUser) segmentsByDayAndUser.set(seg.dayIndex, (byUser = new Map()));
      const spans = byUser.get(entry.userId) ?? [];
      spans.push({ start: seg.startMinute, end: seg.endMinute });
      byUser.set(entry.userId, spans);
    }
  }

  let best: BestOverlap | null = null;

  // Iterate days in display order (not Map insertion order) so that ties
  // resolve to the earliest day and, within a day, the earliest time.
  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const byUser = segmentsByDayAndUser.get(dayIndex);
    if (!byUser) continue;

    type Event = { minute: number; delta: number };
    const events: Event[] = [];
    for (const spans of byUser.values()) {
      for (const span of mergeMinuteSpans(spans)) {
        events.push({ minute: span.start, delta: 1 });
        events.push({ minute: span.end, delta: -1 });
      }
    }
    // End events before start events at the same instant, so two
    // back-to-back (non-overlapping) spans don't get falsely counted
    // together at the boundary.
    events.sort((a, b) => a.minute - b.minute || a.delta - b.delta);

    let count = 0;
    for (let i = 0; i < events.length; i++) {
      count += events[i].delta;
      const next = events[i + 1];
      if (!next || next.minute === events[i].minute) continue;
      if (count >= 2 && (!best || count > best.count)) {
        best = { dayIndex, startMinute: events[i].minute, endMinute: next.minute, count };
      }
    }
  }

  return best;
}
