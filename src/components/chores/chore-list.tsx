"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rotateChores, completeChore, removeChore } from "@/lib/actions/chores";
import { isActionError } from "@/lib/action-result";
import type { Dictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
import { effortLabel } from "@/lib/effort-text";
import { describeDue, formatDayTime } from "@/lib/chore-due-text";
import {
  explainAssignment,
  loadGap,
  type ChoreExplanation,
} from "@/lib/chore-explanation";
import { Button } from "@/components/ui/button";
import { SwapButton, type Swappable } from "@/components/chores/swap-controls";

type Chore = {
  id: string;
  name: string;
  effortWeight: number;
  frequency: string;
  currentAssignee: string | null;
  currentAssigneeId: string | null;
  swappedWith: string | null;
  roundLoad: { name: string; effort: number }[];
  periodEnd: string | null;
  explanation: ChoreExplanation | null;
  assignmentId: string | null;
  completedAt: string | null;
  /** When this turn has to be finished by — the deadline, not the day shown. */
  dueBy: string | null;
  isAssigned: boolean;
  markDoneBlockedBy: "unassigned" | "notStarted" | "alreadyDone" | null;
  /** Whether removing it would erase a record of work already done. */
  hasHistory: boolean;
};

/** Today where the group lives — not where the server happens to run. */
function todayIso(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const FREQ_KEY = {
  DAILY: "freqDaily",
  WEEKLY: "freqWeekly",
  BIWEEKLY: "freqBiweekly",
  MONTHLY: "freqMonthly",
} as const;

export function ChoreList({
  groupId,
  onDate,
  timeZone,
  chores,
  currentUserId,
  dict,
}: {
  groupId: string;
  /** The day being looked at, as yyyy-mm-dd. */
  onDate: string;
  /** The clock the household keeps. */
  timeZone: string;
  chores: Chore[];
  currentUserId: string;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  // Your own chores first, because the question you arrive with is "what do I
  // have to do?" — not "what is everybody doing?". One list of everyone's
  // chores buries yours among theirs.
  const [showing, setShowing] = useState<string>(currentUserId);
  // Independent of the person filter, so the two combine: "what has Lola
  // still got left?" is one question, not two screens.
  const [status, setStatus] = useState<"all" | "todo" | "done">("all");
  // Independent of the other two, so "Lola's daily chores still to do" is one
  // question rather than three screens.
  const [howOften, setHowOften] = useState<"all" | keyof typeof FREQ_KEY>("all");

  // Everyone who currently holds a chore, so the picker only offers names
  // that would actually show something.
  const people = [
    ...new Map(
      chores
        .filter((c) => c.currentAssigneeId && c.currentAssignee)
        .map((c) => [c.currentAssigneeId as string, c.currentAssignee as string]),
    ),
  ].map(([id, name]) => ({ id, name }));

  const visible = chores
    // A turn nobody holds is shown whoever you are filtering by. Hiding it
    // means filtering on a field that has no value yet, which left every
    // future day blank under the default "my chores" — the feature looking
    // broken precisely where it is most useful.
    .filter((c) => showing === "all" || !c.isAssigned || c.currentAssigneeId === showing)
    .filter((c) =>
      status === "all"
        ? true
        : status === "done"
          ? Boolean(c.completedAt)
          : !c.completedAt,
    )
    .filter((c) => howOften === "all" || c.frequency === howOften);

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
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onRotate} disabled={pending} size="sm" className="w-fit">
          {pending ? dict.chores.rotating : dict.chores.rotateNow}
        </Button>
        <select
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
          value={showing}
          onChange={(e) => setShowing(e.target.value)}
          aria-label={dict.chores.filterMine}
        >
          <option value={currentUserId}>{dict.chores.filterMine}</option>
          {people
            .filter((p) => p.id !== currentUserId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          <option value="all">{dict.chores.filterEveryone}</option>
        </select>
        <select
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          aria-label={dict.chores.statusAll}
        >
          <option value="all">{dict.chores.statusAll}</option>
          <option value="todo">{dict.chores.statusTodo}</option>
          <option value="done">{dict.chores.statusDone}</option>
        </select>
        <select
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
          value={howOften}
          onChange={(e) => setHowOften(e.target.value as typeof howOften)}
          aria-label={dict.chores.everyFrequency}
        >
          <option value="all">{dict.chores.everyFrequency}</option>
          <option value="DAILY">{dict.chores.freqDaily}</option>
          <option value="WEEKLY">{dict.chores.freqWeekly}</option>
          <option value="BIWEEKLY">{dict.chores.freqBiweekly}</option>
          <option value="MONTHLY">{dict.chores.freqMonthly}</option>
        </select>
        {/* Navigates rather than setting state, so the chosen day is in the
            URL and a link to it still means that day for whoever opens it. */}
        <input
          type="date"
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
          value={onDate}
          aria-label={dict.chores.onDate}
          onChange={(e) =>
            router.push(
              e.target.value
                ? `?date=${e.target.value}`
                : window.location.pathname,
            )
          }
        />
        {onDate !== todayIso(timeZone) && (
          <Button size="sm" variant="ghost" onClick={() => router.push("?")}>
            {dict.chores.backToToday}
          </Button>
        )}
      </div>
      {lastResult && <p className="text-sm text-muted-foreground">{lastResult}</p>}
      {chores.length === 0 && (
        <p className="text-sm text-muted-foreground">{dict.chores.noChoresYet}</p>
      )}
      {chores.length > 0 && visible.length === 0 && (
        <p className="text-sm text-muted-foreground">{dict.chores.filterNone}</p>
      )}
      <ul className="flex flex-col gap-2">
        {visible.map((chore) => (
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
                effortWeight: c.effortWeight,
                frequency: c.frequency,
                assigneeName: c.currentAssignee as string,
              }))}
            isMine={chore.currentAssigneeId === currentUserId}
            onDate={onDate}
            timeZone={timeZone}
            // Looking ahead is looking, not doing.
            isFutureDay={onDate > todayIso(timeZone)}
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
  onDate,
  timeZone,
  isFutureDay,
  dict,
}: {
  chore: Chore;
  others: Swappable[];
  isMine: boolean;
  onDate: string;
  timeZone: string;
  isFutureDay: boolean;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [showMath, setShowMath] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function onComplete() {
    if (!chore.assignmentId) return;
    setPending(true);
    await completeChore(chore.assignmentId);
    setPending(false);
    router.refresh();
  }

  async function onRemove() {
    setPending(true);
    setRemoveError(null);
    const result = await removeChore(chore.id);
    setPending(false);
    if (isActionError(result)) {
      setRemoveError(result.error);
      return;
    }
    setConfirmRemove(false);
    router.refresh();
  }

  const frequencyLabel = dict.chores[FREQ_KEY[chore.frequency as keyof typeof FREQ_KEY]];
  const gap = loadGap(chore.roundLoad);
  const dueLabel = describeDue(chore.dueBy, onDate, dict, timeZone);

  return (
    <li className="rounded-lg border p-3 text-sm">
      {/* Wraps, and the title is allowed to shrink. The controls are shrink-0
          so they stay legible, which on a narrow phone meant a long chore name
          shoved them off the right-hand edge and took the whole page into
          horizontal scroll with it. */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1">
          {/* The number alone says nothing — "effort 10" only means something
              if you already know what it's heavy relative to. */}
          <strong>{chore.name}</strong> ({effortLabel(chore.effortWeight, dict)},{" "}
          {frequencyLabel.toLowerCase()}) —{" "}
          {chore.currentAssignee
            ? interpolate(dict.chores.assignedTo, { name: chore.currentAssignee })
            : chore.isAssigned
              ? dict.chores.unassigned
              : dict.chores.notHandedOutYet}
          {/* Without this a weekly chore showing on Thursday reads as a
              Thursday job. It is due by Sunday, and the difference is the
              whole reason the day filter needs explaining. */}
          {dueLabel && (
            // The server is not in the reader's time zone, so its first pass
            // prints a different clock time. Suppressed rather than pinned to
            // UTC: a deadline is an instant, and the hour that matters is the
            // one on the reader's own clock.
            <span suppressHydrationWarning className="text-muted-foreground">
              {" "}
              — {dueLabel}
            </span>
          )}
          {/* Says the chore arrived by agreement. Without it the reasoning
              below names whoever the rotation originally picked, while the
              chore sits with someone else — which reads as a bug. */}
          {chore.swappedWith && (
            <span className="text-muted-foreground">
              {" "}
              ({interpolate(dict.chores.swappedWith, { name: chore.swappedWith })})
            </span>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {chore.explanation && (
            <Button variant="ghost" size="sm" onClick={() => setShowMath((v) => !v)}>
              {showMath ? dict.common.hideMath : dict.common.showMath}
            </Button>
          )}
          {/* Removal asks first and says which of the two things it will do.
              A chore nobody has ever been given is simply deleted; one with
              history is retired instead, and the difference matters enough to
              the person pressing it that it's worth spelling out. */}
          <Button
            variant="ghost"
            size="sm"
            aria-label={interpolate(dict.chores.removeChore, { name: chore.name })}
            title={interpolate(dict.chores.removeChore, { name: chore.name })}
            disabled={pending}
            onClick={() => setConfirmRemove(true)}
          >
            ×
          </Button>
        </div>
      </div>

      {confirmRemove && (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-rule bg-card px-3 py-2 text-xs">
          <p>
            {interpolate(
              chore.hasHistory
                ? dict.chores.removeChoreKept
                : dict.chores.removeChoreGone,
              { name: chore.name },
            )}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={pending} onClick={onRemove}>
              {dict.chores.removeChoreConfirm}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirmRemove(false)}
            >
              {dict.common.cancel}
            </Button>
          </div>
          {removeError && <p className="text-destructive">{removeError}</p>}
        </div>
      )}
      {showMath && chore.explanation && (
        <div className="mt-2 flex flex-col gap-2">
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            {explainAssignment(chore.explanation, dict).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>

          {/* Where everyone actually stands: every chore they have ever been
              given, weighted and totalled.

              This is the same figure the rotation compares when it picks
              somebody, which is the whole point of showing it. It used to show
              only what people were holding today — a different measure, so the
              reason printed on a chore could never be reconciled with the
              totals underneath it, and the panel could show the person who was
              slightly ahead as the one furthest behind.

              Computed now rather than read from what the rotation recorded:
              swaps move chores afterwards and a stored split goes on claiming
              "even" long after it stopped being true. */}
          {chore.roundLoad.length > 1 && (
            <div className="flex flex-col gap-1 rounded-md border border-rule bg-card px-3 py-2 text-xs">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{dict.chores.roundSplit}</span>
                {chore.roundLoad.map((t) => (
                  <span key={t.name} className="text-muted-foreground">
                    {t.name}{" "}
                    <span className="tabular font-medium text-foreground">
                      {t.effort}
                    </span>
                  </span>
                ))}
              </div>
              {/* What the numbers are and what happens next. Without both, a
                  gap looks like the app failing to be fair rather than the app
                  part-way through evening it out. */}
              <p className="text-muted-foreground">{dict.chores.roundNote}</p>
              <p className="text-emerald-700 dark:text-emerald-400">
                {gap
                  ? interpolate(dict.chores.roundGap, {
                      name: gap.behind,
                      gap: gap.gap,
                    })
                  : dict.chores.roundLevel}
              </p>
            </div>
          )}
        </div>
      )}
      {chore.assignmentId && (
        <div className="mt-2">
          {chore.completedAt ? (
            // Same reasoning as the deadline above: the locale is pinned,
            // the zone is the reader's, and the mismatch with the server's
            // first pass is expected rather than a bug to chase.
            <p
              suppressHydrationWarning
              className="text-xs text-emerald-600 dark:text-emerald-400"
            >
              {interpolate(dict.chores.doneAt, {
                datetime: formatDayTime(chore.completedAt, timeZone),
              })}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {/* Only the assignee marks it done, because the effort is
                  credited to them — pressing it on someone else's chore was
                  handing them credit for work they might not have done. */}
              {/* Not offered on a day that hasn't arrived. A long turn can be
                  live now and still show on a future date, so the button was
                  reachable there — and pressing it would record work as done
                  for a day nobody has lived through yet.

                  Swapping stays available: arranging who does a job later is a
                  reasonable thing to do while looking ahead. Claiming to have
                  finished it is not. */}
              {isMine && !isFutureDay && chore.markDoneBlockedBy === null && (
                <Button size="sm" variant="outline" disabled={pending} onClick={onComplete}>
                  {dict.chores.markDone}
                </Button>
              )}
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
