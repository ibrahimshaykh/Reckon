import { interpolate } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionary";

/**
 * A date as a person reads it: "Sun 9 Aug".
 *
 * Locale and time zone are both pinned. The turn boundaries are stored as
 * instants and the day filter is read as UTC, so formatting in the viewer's
 * zone would put a chore handed over at 23:00 on a different date for two
 * flatmates — and would render differently on the server than in the browser,
 * which this app has been bitten by before.
 */
export function formatDay(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

/**
 * When this turn has to be finished, relative to the day being looked at.
 *
 * The reason the day filter needs this at all: a weekly chore is live on all
 * seven days of its turn, so it appears on every one of them. Without the
 * deadline beside it, somebody scrolling to Thursday reads "clean the
 * bathroom" as a Thursday job, and a chore they have until Sunday to do looks
 * like one they are already late on.
 */
export function describeDue(
  dueBy: string | null,
  onDate: string,
  dict: Dictionary,
): string {
  if (!dueBy) return "";
  const due = new Date(dueBy);
  if (Number.isNaN(due.getTime())) return "";

  // A turn ending at any point during the day on screen is due that day; there
  // is no use printing the date somebody is already looking at.
  const dueDay = due.toISOString().slice(0, 10);
  if (dueDay === onDate) return dict.chores.dueThisDay;

  return interpolate(dict.chores.dueBy, { date: formatDay(dueBy) });
}
