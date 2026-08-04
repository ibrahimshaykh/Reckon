"use client";

import { useState } from "react";
import { getMonthlyRecap } from "@/lib/actions/recap";
import { isActionError } from "@/lib/action-result";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { SketchPanel } from "@/components/sketch/sketch-ui";
import type { Dictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";

type Recap = {
  summaryText: string;
  totalSpentCents: number;
  topExpenses: { title: string; amount: number }[];
  choresCompleted: number;
  proposalsDecided: number;
  choreMvpName: string | null;
  bigSpenderName: string | null;
  previousTotalSpentCents: number | null;
};

export function RecapView({
  groupId,
  currency,
  dict,
}: {
  groupId: string;
  currency: string;
  dict: Dictionary;
}) {
  const [recap, setRecap] = useState<Recap | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    setPending(true);
    setError(null);
    const result = await getMonthlyRecap(groupId);
    if (isActionError(result)) {
      setError(result.error);
    } else {
      setRecap(result);
    }
    setPending(false);
  }

  const delta =
    recap && recap.previousTotalSpentCents !== null
      ? recap.totalSpentCents - recap.previousTotalSpentCents
      : null;

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={onGenerate} disabled={pending}>
        {pending ? dict.recap.generating : dict.recap.generateButton}
      </Button>

      {error && (
        <p className="rounded-lg border border-warm/40 bg-warm-surface/40 p-3 text-sm">{error}</p>
      )}

      {recap && (
        <div className="flex flex-col gap-3">
          {/* The month totted up at the foot of the page. Everything else here
              is context for this one number, and it was previously set at the
              same size as a list item, so the page had no answer to the only
              question it exists to answer. */}
          <SketchPanel tone="var(--feature-recap)" className="text-center">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              {dict.recap.totalSpent}
            </p>
            <p className="tabular mt-1 text-4xl leading-none sm:text-5xl">
              {formatMoney(recap.totalSpentCents, currency)}
            </p>
            {delta !== null && (
              <p
                className={`tabular mt-2 text-xs ${
                  delta > 0
                    ? "text-destructive"
                    : delta < 0
                      ? "text-positive"
                      : "text-muted-foreground"
                }`}
              >
                {delta === 0 ? dict.recap.sameAs : delta > 0 ? "↑" : "↓"}{" "}
                {formatMoney(Math.abs(delta), currency)} {dict.recap.vsLastMonth}
              </p>
            )}
          </SketchPanel>

          {recap.topExpenses.length > 0 && (
            <SketchPanel variant={1}>
              <p className="mb-1.5 text-xs tracking-wide text-muted-foreground uppercase">
                {dict.recap.topExpenses}
              </p>
              <ul className="flex flex-col gap-1 text-sm">
                {recap.topExpenses.map((e, i) => (
                  // Dot leaders instead of a dash, so the title and its figure
                  // stay tied together however far apart the row pushes them.
                  <li key={i} className="flex items-baseline gap-2">
                    <span className="min-w-0">{e.title}</span>
                    <span aria-hidden className="leader-fill" />
                    <span className="tabular shrink-0">
                      {formatMoney(Math.round(e.amount * 100), currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </SketchPanel>
          )}

          <div className="grid grid-cols-2 gap-3">
            <SketchPanel className="text-center">
              <p className="tabular text-3xl leading-none">{recap.choresCompleted}</p>
              <p className="mt-1 text-xs text-muted-foreground">{dict.recap.choresDone}</p>
            </SketchPanel>
            <SketchPanel variant={1} className="text-center">
              <p className="tabular text-3xl leading-none">{recap.proposalsDecided}</p>
              <p className="mt-1 text-xs text-muted-foreground">{dict.recap.plansDecided}</p>
            </SketchPanel>
          </div>

          {(recap.choreMvpName || recap.bigSpenderName) && (
            <div className="flex flex-wrap gap-2">
              {recap.choreMvpName && (
                <span className="sketch-pill bg-card px-3 py-1 text-xs">
                  {interpolate(dict.recap.choreMvp, { name: recap.choreMvpName })}
                </span>
              )}
              {recap.bigSpenderName && (
                <span className="sketch-pill bg-card px-3 py-1 text-xs">
                  {interpolate(dict.recap.bigSpender, { name: recap.bigSpenderName })}
                </span>
              )}
            </div>
          )}

          <p className="text-sm text-muted-foreground">{recap.summaryText}</p>
        </div>
      )}
    </div>
  );
}
