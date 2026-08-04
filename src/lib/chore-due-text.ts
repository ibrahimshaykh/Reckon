import { interpolate } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionary";
import { lastCoveredDay, toIsoDate } from "@/lib/chore-schedule";

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
  year: "numeric",
} as const;

const timeParts = {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
} as const;

/** A plain calendar date shifted by whole days, for naming the ones either side. */
function shiftDate(isoDate: string, days: number): string {
  const at = new Date(`${isoDate}T00:00:00.000Z`).getTime();
  if (Number.isNaN(at)) return "";
  return new Date(at + days * 86_400_000).toISOString().slice(0, 10);
}

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
 * Said as a day rather than a clock time. Turns now end at midnight, so a time
 * would read "12:00 am" on every row and mean nothing; and the last day is the
 * honest answer to "when do I have to have done this by".
 */
export function describeDue(
  dueBy: string | null,
  /** Today's date where the group lives — NOT the day being viewed. */
  today: string,
  dict: Dictionary,
  timeZone: string,
): string {
  const due = valid(dueBy);
  if (!due) return "";

  // The end is exclusive — a turn finishing at midnight on the 4th is the
  // 3rd's work — so the day quoted is the instant just before it.
  const lastDay = lastCoveredDay(due);
  // Always the full date, so the row means the same thing whichever day is on
  // screen. The word after it is measured against the real today, not the day
  // being viewed — comparing against the view called a deadline "today" while
  // you were looking back at yesterday, which is the one reading it cannot
  // have.
  //
  // Named in the group's own clock, the same one the day filter uses. Reading
  // this in UTC while the filter read local put a turn on the 4th and labelled
  // it the 3rd.
  const dayIso = toIsoDate(lastDay, timeZone);
  const date = formatDay(lastDay.toISOString(), timeZone);

  const key =
    dayIso === today
      ? "dueThisDay"
      : dayIso === shiftDate(today, -1)
        ? "dueYesterday"
        : dayIso === shiftDate(today, 1)
          ? "dueTomorrow"
          : "dueBy";

  return interpolate(dict.chores[key], { date });
}
