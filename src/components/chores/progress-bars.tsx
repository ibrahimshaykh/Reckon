"use client";

import { interpolate } from "@/lib/i18n";
import type { FrequencyProgress } from "@/lib/chore-progress";
import type { Dictionary } from "@/lib/dictionary";

const TITLE = {
  DAILY: "progressDaily",
  WEEKLY: "progressWeekly",
  BIWEEKLY: "progressBiweekly",
  MONTHLY: "progressMonthly",
} as const;

/**
 * How far through the current round everybody is, one box per frequency.
 *
 * Split up because the frequencies answer different questions and a single bar
 * blurred them: the weekly chore somebody has until Sunday to do dragged the
 * same figure as the bins that need doing this evening. "Am I finished for
 * today" is the question people actually open the app with.
 *
 * The fraction is against what that person is holding now, which is the only
 * denominator that exists. Measured against an all-time total the number would
 * never reach the end, because the total grows every time a chore is handed
 * out.
 */
export function ProgressBars({
  progress,
  dict,
}: {
  progress: FrequencyProgress[];
  dict: Dictionary;
}) {
  if (progress.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {progress.map((block) => (
        <div
          key={block.frequency}
          className="flex min-w-[13rem] flex-1 flex-col gap-1.5 rounded-lg border p-3"
        >
          <p className="text-xs font-medium">{dict.chores[TITLE[block.frequency]]}</p>
          {block.people.map((p) => (
            <div key={p.name} className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 truncate">{p.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={
                    p.total > 0 && p.done === p.total
                      ? "h-full rounded-full bg-emerald-600 dark:bg-emerald-500"
                      : "h-full rounded-full bg-primary"
                  }
                  style={{ width: `${p.percent}%` }}
                />
              </div>
              {/* The fraction, not just the bar. A bar shows roughly how far
                  along somebody is; the numbers say what is actually left. */}
              <span className="tabular shrink-0 text-right text-muted-foreground">
                {p.total === 0
                  ? dict.chores.progressNothing
                  : interpolate(dict.chores.progressOf, {
                      done: p.done,
                      total: p.total,
                    })}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
