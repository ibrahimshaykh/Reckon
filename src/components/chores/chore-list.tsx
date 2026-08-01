"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rotateChores, completeChore } from "@/lib/actions/chores";
import type { Dictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
import { effortLabel } from "@/lib/effort-text";
import {
  explainAssignment,
  isLegacyExplanation,
  isRoundEven,
  type ChoreExplanation,
} from "@/lib/chore-explanation";
import { Button } from "@/components/ui/button";
import { SwapButton } from "@/components/chores/swap-controls";

type Chore = {
  id: string;
  name: string;
  effortWeight: number;
  frequency: string;
  currentAssignee: string | null;
  currentAssigneeId: string | null;
  periodEnd: string | null;
  explanation: ChoreExplanation | null;
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
  currentUserId,
  dict,
}: {
  groupId: string;
  chores: Chore[];
  currentUserId: string;
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
          <ChoreRow
            key={chore.id}
            chore={chore}
            // Everyone else's live chores, which are what this one could be
            // traded for. Computed here so each row doesn't rescan the list.
            others={chores
              .filter(
                (c) =>
                  c.assignmentId &&
                  !c.completedAt &&
                  c.currentAssigneeId &&
                  c.currentAssigneeId !== currentUserId,
              )
              .map((c) => ({
                assignmentId: c.assignmentId as string,
                choreName: c.name,
                assigneeName: c.currentAssignee as string,
              }))}
            isMine={chore.currentAssigneeId === currentUserId}
            dict={dict}
          />
        ))}
      </ul>
    </div>
  );
}

function ChoreRow({
  chore,
  others,
  isMine,
  dict,
}: {
  chore: Chore;
  others: { assignmentId: string; choreName: string; assigneeName: string }[];
  isMine: boolean;
  dict: Dictionary;
}) {
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
          {/* The number alone says nothing — "effort 10" only means something
              if you already know what it's heavy relative to. */}
          <strong>{chore.name}</strong> ({effortLabel(chore.effortWeight, dict)},{" "}
          {frequencyLabel.toLowerCase()}) —{" "}
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
        <div className="mt-2 flex flex-col gap-2">
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            {explainAssignment(chore.explanation, dict).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>

          {/* The whole round, not just this person's slice. Being shown that
              it came out level settles an argument in a way that being told
              your own share was fair never does. */}
          {!isLegacyExplanation(chore.explanation) &&
            chore.explanation.roundTotals.length > 1 && (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-rule bg-card px-3 py-2 text-xs">
                <span className="font-medium">{dict.chores.roundSplit}</span>
                {chore.explanation.roundTotals.map((t) => (
                  <span key={t.name} className="text-muted-foreground">
                    {t.name}{" "}
                    <span className="tabular font-medium text-foreground">
                      {t.effort}
                    </span>
                  </span>
                ))}
                {isRoundEven(chore.explanation.roundTotals) && (
                  <span className="ms-auto text-emerald-600 dark:text-emerald-400">
                    {dict.chores.roundEven}
                  </span>
                )}
              </div>
            )}
        </div>
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
            <div className="flex flex-wrap items-center gap-1">
              <Button size="sm" variant="outline" disabled={pending} onClick={onComplete}>
                {dict.chores.markDone}
              </Button>
              {/* Only your own chore is yours to offer. */}
              {isMine && (
                <SwapButton
                  myAssignmentId={chore.assignmentId}
                  others={others}
                  dict={dict}
                />
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
