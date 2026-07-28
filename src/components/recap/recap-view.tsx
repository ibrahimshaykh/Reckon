"use client";

import { useState } from "react";
import { getMonthlyRecap } from "@/lib/actions/recap";
import { isActionError } from "@/lib/action-result";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
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
        <div className="flex flex-col gap-2">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">{dict.recap.totalSpent}</p>
            <p className="text-2xl font-semibold">{formatMoney(recap.totalSpentCents, currency)}</p>
            {delta !== null && (
              <p
                className={`text-xs ${
                  delta > 0
                    ? "text-destructive"
                    : delta < 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground"
                }`}
              >
                {delta === 0 ? dict.recap.sameAs : delta > 0 ? "↑" : "↓"}{" "}
                {formatMoney(Math.abs(delta), currency)} {dict.recap.vsLastMonth}
              </p>
            )}
          </div>

          {recap.topExpenses.length > 0 && (
            <div className="rounded-lg border p-3">
              <p className="mb-1 text-xs text-muted-foreground">{dict.recap.topExpenses}</p>
              <ul className="flex flex-col gap-0.5 text-sm">
                {recap.topExpenses.map((e, i) => (
                  <li key={i}>
                    {e.title} — {formatMoney(Math.round(e.amount * 100), currency)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-xl font-semibold">{recap.choresCompleted}</p>
              <p className="text-xs text-muted-foreground">{dict.recap.choresDone}</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-xl font-semibold">{recap.proposalsDecided}</p>
              <p className="text-xs text-muted-foreground">{dict.recap.plansDecided}</p>
            </div>
          </div>

          {(recap.choreMvpName || recap.bigSpenderName) && (
            <div className="flex flex-wrap gap-2">
              {recap.choreMvpName && (
                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                  {interpolate(dict.recap.choreMvp, { name: recap.choreMvpName })}
                </span>
              )}
              {recap.bigSpenderName && (
                <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-600 dark:text-amber-400">
                  {interpolate(dict.recap.bigSpender, { name: recap.bigSpenderName })}
                </span>
              )}
            </div>
          )}

          <p className="rounded-lg border p-3 text-sm text-muted-foreground">{recap.summaryText}</p>
        </div>
      )}
    </div>
  );
}
