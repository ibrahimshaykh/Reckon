import { interpolate } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionary";

/**
 * Deadlines are instants, so the clock time is shown in the reader's own zone
 * — a turn ending at 17:35 UTC is half ten at night in Karachi, and printing
 * 5:35 pm there would be wrong in a way a date alone never is.
 *
 * The locale is pinned even so. This app has already been bitten by Intl
 * disagreeing between Node and the browser (see formatMoney's history), and a
 * locale-dependent date would risk that across every language it supports.
 *
 * `timeZone` exists so tests can pin one; nothing in the app passes it, which
 * is what makes the rendered time local. Anywhere these are rendered inside a
 * server-rendered component needs suppressHydrationWarning, because the server
 * and the reader are not in the same place.
 */
const dayParts = {
  weekday: "short",
  day: "numeric",
  month: "short",
} as const;

const timeParts = {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
} as const;

function valid(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Sun 9 Aug" */
export function formatDay(iso: string | null, timeZone?: string): string {
  const date = valid(iso);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", { ...dayParts, timeZone }).format(date);
}

/** "10:35 pm" */
export function formatTime(iso: string | null, timeZone?: string): string {
  const date = valid(iso);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", { ...timeParts, timeZone })
    .format(date)
    .toLowerCase();
}

/** "Sun 9 Aug, 10:35 pm" */
export function formatDayTime(iso: string | null, timeZone?: string): string {
  const date = valid(iso);
  if (!date) return "";
  return `${formatDay(iso, timeZone)}, ${formatTime(iso, timeZone)}`;
}

/**
 * When this turn has to be finished, relative to the day being looked at.
 *
 * The reason the day filter needs this at all: a weekly chore is live on all
 * seven days of its turn, so it appears on every one of them. Without the
 * deadline beside it, somebody scrolling to Thursday reads "clean the
 * bathroom" as a Thursday job, and a chore they have until Sunday to do looks
 * like one they are already late on.
 *
 * On the day itself the date is dropped and only the time kept — repeating the
 * date somebody is already looking at tells them nothing, but the hour they
 * have left does.
 */
export function describeDue(
  dueBy: string | null,
  onDate: string,
  dict: Dictionary,
  timeZone?: string,
): string {
  const due = valid(dueBy);
  if (!due) return "";

  // Compared in UTC because that is how the day filter itself is defined, so
  // "the day on screen" means the same thing in both places.
  const dueDay = due.toISOString().slice(0, 10);
  if (dueDay === onDate) {
    return interpolate(dict.chores.dueThisDay, { time: formatTime(dueBy, timeZone) });
  }

  return interpolate(dict.chores.dueBy, { date: formatDayTime(dueBy, timeZone) });
}
