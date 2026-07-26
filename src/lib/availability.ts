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
