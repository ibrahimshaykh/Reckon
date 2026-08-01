"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  proposeSwap,
  respondToSwap,
  cancelSwap,
  openSwapCall,
  claimSwapCall,
} from "@/lib/actions/chore-swaps";
import { isActionError, type ActionResult } from "@/lib/action-result";
import { interpolate } from "@/lib/i18n";
import { effortWord } from "@/lib/effort-text";
import { Button } from "@/components/ui/button";
import type { SwapOffer } from "@/lib/actions/chore-swaps";
import type { Dictionary } from "@/lib/dictionary";

export type Swappable = {
  assignmentId: string;
  choreName: string;
  assigneeName: string;
};

async function run(
  action: () => Promise<ActionResult<void>>,
  onError: (message: string) => void,
) {
  const result = await action();
  if (isActionError(result)) {
    onError(result.error);
    return false;
  }
  return true;
}

// Getting out of a chore, two ways. Asking one person at a time means guessing
// who'll say yes — in a flat of four that's three separate asks. So the
// default is to ask everyone at once, with the directed version kept for when
// you want somebody's particular job.
export function SwapButton({
  myAssignmentId,
  others,
  dict,
}: {
  myAssignmentId: string;
  /** Everyone else's unfinished chores in this group. */
  others: Swappable[];
  dict: Dictionary;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: () => Promise<ActionResult<void>>) {
    setPending(true);
    setError(null);
    const ok = await run(action, setError);
    setPending(false);
    if (ok) {
      setOpen(false);
      router.refresh();
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {dict.chores.swapButton}
      </Button>
    );
  }

  return (
    <div className="mt-2 flex w-full flex-col gap-2 rounded-lg border border-rule bg-card p-3">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => act(() => openSwapCall(myAssignmentId))}
      >
        {dict.chores.swapAskAnyone}
      </Button>

      <p className="text-xs font-medium">{dict.chores.swapAskSomeone}</p>
      {others.length === 0 ? (
        <p className="text-xs text-muted-foreground">{dict.chores.swapNothingToSwap}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {others.map((other) => (
            <Button
              key={other.assignmentId}
              variant="outline"
              size="sm"
              disabled={pending}
              className="justify-start"
              onClick={() =>
                act(() =>
                  proposeSwap({
                    myAssignmentId,
                    theirAssignmentId: other.assignmentId,
                  }),
                )
              }
            >
              {other.choreName} — {other.assigneeName}
            </Button>
          ))}
        </div>
      )}

      {/* Says why trading is safe, since the obvious worry is that dodging a
          job flatters your fairness bar. It doesn't. */}
      <p className="text-[0.7rem] text-muted-foreground">{dict.chores.swapNote}</p>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button variant="ghost" size="sm" className="self-start" onClick={() => setOpen(false)}>
        {pending ? dict.chores.swapSending : dict.chores.swapCancel}
      </Button>
    </div>
  );
}

// Everything live: offers made to you, offers you've made, and open calls the
// whole group can see.
export function SwapOffers({
  offers,
  mine,
  dict,
}: {
  offers: SwapOffer[];
  /** Your own unfinished chores — what you'd give to take an open call. */
  mine: Swappable[];
  dict: Dictionary;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (offers.length === 0) return null;

  async function act(id: string, action: () => Promise<ActionResult<void>>) {
    setPendingId(id);
    setError(null);
    const ok = await run(action, setError);
    setPendingId(null);
    if (ok) {
      setClaiming(null);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {offers.map((offer) => (
        <div
          key={offer.id}
          className="flex flex-col gap-2 rounded-lg border border-warm/50 bg-warm-surface/30 px-3 py-2 text-xs"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1">
              {offer.kind === "incoming" &&
                interpolate(dict.chores.swapIncoming, {
                  name: offer.fromName,
                  yours: offer.toChore ?? "",
                  theirs: offer.fromChore,
                })}
              {offer.kind === "outgoing" &&
                interpolate(dict.chores.swapOutgoing, {
                  // Whoever you asked, not yourself.
                  name: offer.toName ?? "",
                  yours: offer.fromChore,
                  theirs: offer.toChore ?? "",
                })}
              {offer.kind === "myCall" &&
                interpolate(dict.chores.swapMyCall, { yours: offer.fromChore })}
              {offer.kind === "openCall" &&
                interpolate(dict.chores.swapOpenCall, {
                  name: offer.fromName,
                  theirs: offer.fromChore,
                  // Shown so nobody takes on a job without seeing its weight.
                  band: effortWord(offer.fromEffort, dict),
                })}
            </span>

            {offer.kind === "incoming" && (
              <>
                <Button
                  size="sm"
                  disabled={pendingId === offer.id}
                  onClick={() =>
                    act(offer.id, () => respondToSwap({ swapId: offer.id, accept: true }))
                  }
                >
                  {dict.chores.swapAccept}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingId === offer.id}
                  onClick={() =>
                    act(offer.id, () =>
                      respondToSwap({ swapId: offer.id, accept: false }),
                    )
                  }
                >
                  {dict.chores.swapDecline}
                </Button>
              </>
            )}

            {(offer.kind === "outgoing" || offer.kind === "myCall") && (
              <Button
                size="sm"
                variant="outline"
                disabled={pendingId === offer.id}
                onClick={() => act(offer.id, () => cancelSwap(offer.id))}
              >
                {dict.chores.swapWithdraw}
              </Button>
            )}

            {offer.kind === "openCall" && claiming !== offer.id && (
              <Button
                size="sm"
                disabled={pendingId === offer.id || mine.length === 0}
                onClick={() => setClaiming(offer.id)}
              >
                {dict.chores.swapTake}
              </Button>
            )}
          </div>

          {/* Taking an open call still means giving something back, so the
              claim asks which of yours before it goes through. */}
          {offer.kind === "openCall" && claiming === offer.id && (
            <div className="flex flex-col gap-1">
              {mine.length === 0 ? (
                <p className="text-muted-foreground">{dict.chores.swapNothingToSwap}</p>
              ) : (
                mine.map((m) => (
                  <Button
                    key={m.assignmentId}
                    size="sm"
                    variant="outline"
                    className="justify-start"
                    disabled={pendingId === offer.id}
                    onClick={() =>
                      act(offer.id, () =>
                        claimSwapCall({
                          callId: offer.id,
                          myAssignmentId: m.assignmentId,
                        }),
                      )
                    }
                  >
                    {m.choreName}
                  </Button>
                ))
              )}
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setClaiming(null)}
              >
                {dict.chores.swapCancel}
              </Button>
            </div>
          )}
        </div>
      ))}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
