"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rotateChores, completeChore } from "@/lib/actions/chores";
import type { Dictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

type Chore = {
  id: string;
  name: string;
  effortWeight: number;
  frequency: string;
  currentAssignee: string | null;
  periodEnd: string | null;
  explanation: { steps: string[] } | null;
  assignmentId: string | null;
  completedAt: string | null;
};

const FREQ_KEY = {
  DAILY: "freqDaily",
  WEEKLY: "freqWeekly",
  BIWEEKLY: "freqBiweekly",
  MONTHLY: "freqMonthly",
} as const;

export function ChoreList({
  groupId,
  chores,
  dict,
}: {
  groupId: string;
  chores: Chore[];
  dict: Dictionary;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function onRotate() {
    setPending(true);
    setLastResult(null);
    try {
      const result = await rotateChores(groupId);
      setLastResult(
        result.created === 0
          ? dict.chores.rotateNothingToDo
          : interpolate(result.created === 1 ? dict.chores.rotatedOne : dict.chores.rotatedMany, {
              n: result.created,
            }),
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={onRotate} disabled={pending} size="sm" className="w-fit">
        {pending ? dict.chores.rotating : dict.chores.rotateNow}
      </Button>
      {lastResult && <p className="text-sm text-muted-foreground">{lastResult}</p>}
      {chores.length === 0 && (
        <p className="text-sm text-muted-foreground">{dict.chores.noChoresYet}</p>
      )}
      <ul className="flex flex-col gap-2">
        {chores.map((chore) => (
          <ChoreRow key={chore.id} chore={chore} dict={dict} />
        ))}
      </ul>
    </div>
  );
}

function ChoreRow({ chore, dict }: { chore: Chore; dict: Dictionary }) {
  const router = useRouter();
  const [showMath, setShowMath] = useState(false);
  const [pending, setPending] = useState(false);

  async function onComplete() {
    if (!chore.assignmentId) return;
    setPending(true);
    await completeChore(chore.assignmentId);
    setPending(false);
    router.refresh();
  }

  const frequencyLabel = dict.chores[FREQ_KEY[chore.frequency as keyof typeof FREQ_KEY]];

  return (
    <li className="rounded-lg border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p>
          <strong>{chore.name}</strong> (effort {chore.effortWeight}, {frequencyLabel.toLowerCase()}) —{" "}
          {chore.currentAssignee
            ? interpolate(dict.chores.assignedTo, { name: chore.currentAssignee })
            : dict.chores.unassigned}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {chore.explanation && (
            <Button variant="ghost" size="sm" onClick={() => setShowMath((v) => !v)}>
              {showMath ? dict.common.hideMath : dict.common.showMath}
            </Button>
          )}
        </div>
      </div>
      {showMath && chore.explanation && (
        <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
          {chore.explanation.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ul>
      )}
      {chore.assignmentId && (
        <div className="mt-2">
          {chore.completedAt ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {interpolate(dict.chores.doneAt, {
                // Pinned to en-US regardless of UI language, deliberately —
                // this app already hit a real hydration mismatch once from
                // Intl formatting disagreeing between Node and the browser
                // (see formatMoney's history); a locale-dependent date here
                // would risk the same class of bug across even more locales.
                datetime: new Date(chore.completedAt).toLocaleString("en-US", {
                  weekday: "short",
                  hour: "numeric",
                  minute: "2-digit",
                }),
              })}
            </p>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} onClick={onComplete}>
              {dict.chores.markDone}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
