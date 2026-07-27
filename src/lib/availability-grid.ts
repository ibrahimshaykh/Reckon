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
