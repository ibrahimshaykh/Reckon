"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { adoptGroupTimeZone } from "@/lib/actions/groups";
import { rotateChores } from "@/lib/actions/chores";

/**
 * Teaches the group which clock the household keeps, and moves the page on
 * when the day turns over.
 *
 * Both jobs need the browser, because only it knows where the reader is and
 * only it is still running at midnight. Neither is worth asking anybody to
 * configure: a flat shares a house and therefore a clock, and "it's tomorrow
 * now" is not a preference.
 */
export function TimeZoneSync({
  groupId,
  groupTimeZone,
  onDate,
  pinned,
  needsRotation,
}: {
  groupId: string;
  groupTimeZone: string;
  /** The day the server rendered. */
  onDate: string;
  /** The reader chose this date, so leave them on it. */
  pinned: boolean;
  /** Today has turns that have run out and not been handed on. */
  needsRotation: boolean;
}) {
  const router = useRouter();
  const rotated = useRef(false);

  // Adopt the browser's zone the first time somebody opens a group that has
  // never been told one. Only from UTC — the default — so it can never
  // overwrite a zone the group is already keeping just because one member is
  // travelling.
  useEffect(() => {
    if (groupTimeZone !== "UTC") return;
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!local || local === "UTC") return;

    adoptGroupTimeZone(groupId, local).then((moved) => {
      if (moved) router.refresh();
    });
  }, [groupId, groupTimeZone, router]);

  // Deal today's turns on arrival, so the list is never a button press away
  // from being right.
  //
  // The nightly job cannot cover this alone: it runs at one fixed hour, so a
  // household ahead of it would find their chores unassigned between their own
  // midnight and whenever the job happens to fire. Opening the page is the
  // moment somebody wants an answer, so that is when it is worth making sure
  // there is one.
  //
  // Once per mount, guarded — the refresh below re-renders this component, and
  // a rotation that assigned nothing would otherwise ask again forever.
  useEffect(() => {
    if (!needsRotation || rotated.current) return;
    rotated.current = true;
    rotateChores(groupId).then(() => router.refresh());
  }, [needsRotation, groupId, router]);

  // Roll onto the new day when it arrives. Checked on a timer rather than
  // scheduled for midnight exactly, because a laptop that was asleep at
  // midnight wakes with the old date still on screen.
  useEffect(() => {
    if (pinned) return;

    const check = () => {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: groupTimeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      if (today !== onDate) router.refresh();
    };

    const timer = setInterval(check, 30_000);
    // Also on returning to the tab, so somebody coming back in the morning
    // doesn't wait up to half a minute to see the right day.
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [groupTimeZone, onDate, pinned, router]);

  return null;
}
