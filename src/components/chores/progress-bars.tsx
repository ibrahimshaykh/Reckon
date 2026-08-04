"use client";

import { interpolate } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { SketchPanel } from "@/components/sketch/sketch-ui";
import type { FrequencyProgress } from "@/lib/chore-progress";
import type { Dictionary } from "@/lib/dictionary";

const TITLE = {
  DAILY: "progressDaily",
  WEEKLY: "progressWeekly",
  BIWEEKLY: "progressBiweekly",
  MONTHLY: "progressMonthly",
} as const;

/**
 * How far through the current round everybody is, one panel per frequency.
 *
 * Made the loudest thing on the page deliberately. It is the only part that
 * answers the question somebody actually arrives with — am I finished for
 * today — and it was previously drawn in the same grey as everything else, so
 * the answer had to be hunted for among rows of identical text.
 *
 * Split by frequency because the questions differ: a weekly chore you have
 * until Sunday for dragged the same bar as the bins that need doing tonight.
 *
 * The fraction is against what that person holds now, which is the only
 * denominator that exists. Measured against an all-time total the bar could
 * never fill, because the total grows every time a chore is handed out.
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
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {progress.map((block, i) => (
        <SketchPanel
          key={block.frequency}
          variant={i}
          tone="var(--feature-chores)"
          className="min-w-[15rem] flex-1"
        >
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {dict.chores[TITLE[block.frequency]]}
          </p>

          <div className="flex flex-col gap-2.5">
            {block.people.map((p) => {
              const finished = p.total > 0 && p.done === p.total;
              return (
                <div key={p.name} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-xs">{p.name}</span>
                    {/* The fraction set large, in the hand font. It is the
                        headline of this panel; the bar underneath only shows
                        roughly how far along it is. */}
                    <span
                      className={cn(
                        "tabular shrink-0 text-sm",
                        p.total === 0 && "text-xs text-muted-foreground",
                        finished && "text-positive",
                      )}
                    >
                      {p.total === 0
                        ? dict.chores.progressNothing
                        : interpolate(dict.chores.progressOf, {
                            done: p.done,
                            total: p.total,
                          })}
                    </span>
                  </div>

                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
                      style={{
                        width: `${p.percent}%`,
                        // Green only on a genuinely finished round. Anything
                        // less stays in the page's own amber, so "done" keeps
                        // its meaning.
                        background: finished
                          ? "var(--positive)"
                          : "var(--feature-chores)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </SketchPanel>
      ))}
    </div>
  );
}
