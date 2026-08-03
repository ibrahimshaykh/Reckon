"use client";

import { useState } from "react";
import Link from "next/link";
import { interpolate } from "@/lib/i18n";
import { choreLabel } from "@/lib/effort-text";
import { formatDay } from "@/lib/chore-due-text";
import type { MissedTurn } from "@/lib/chore-load";
import type { Dictionary } from "@/lib/dictionary";

type Bar = {
  userId: string;
  displayName: string;
  completedEffort: number;
  barPercent: number;
  missed: MissedTurn[];
};

export function FairnessBars({
  bars,
  title,
  dict,
}: {
  bars: Bar[];
  title: string;
  dict: Dictionary;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (bars.length === 0) return null;

  const anyMissed = bars.some((b) => b.missed.length > 0);

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {/* Explained only when there is something to explain. */}
      {anyMissed && (
        <p className="text-xs text-muted-foreground">{dict.chores.missedNote}</p>
      )}
      {bars.map((b) => (
        <div key={b.userId} className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 truncate">{b.displayName}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${b.barPercent}%` }}
              />
            </div>
            {/* Wide enough for a weighted per-week figure. These used to be raw
                effort and rarely reached double digits; weighted, a few daily
                chores run into the hundreds and can carry a decimal. */}
            <span className="tabular w-12 shrink-0 text-right text-muted-foreground">
              {b.completedEffort}
            </span>
            {/* A count nobody can act on is half a message. The fix for a job
                somebody did but forgot to tick is to open the day it was due,
                which means naming both the job and the day. */}
            {b.missed.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen(open === b.userId ? null : b.userId)}
                aria-expanded={open === b.userId}
                className="shrink-0 text-amber-700 underline underline-offset-2 dark:text-amber-500"
              >
                {interpolate(dict.chores.missedCount, { n: b.missed.length })}
              </button>
            )}
          </div>

          {open === b.userId && (
            <ul className="flex flex-col gap-0.5 ps-24 text-xs text-muted-foreground">
              {b.missed.map((m, i) => (
                <li key={`${m.choreName}-${m.dueOn}-${i}`}>
                  {/* Straight to the day, where the button to put it right
                      lives. Naming a job without a way to reach it leaves the
                      reader to work out the date and drive the picker. */}
                  <Link
                    href={`?date=${m.dueOn}`}
                    className="underline underline-offset-2"
                  >
                    {interpolate(dict.chores.missedItem, {
                      chore: choreLabel(
                        {
                          name: m.choreName,
                          effortWeight: m.effortWeight,
                          frequency: m.frequency,
                        },
                        dict,
                      ),
                      date: formatDay(`${m.dueOn}T00:00:00.000Z`, "UTC"),
                    })}
                  </Link>
                </li>
              ))}
              <li className="italic">{dict.chores.missedFixHint}</li>
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
