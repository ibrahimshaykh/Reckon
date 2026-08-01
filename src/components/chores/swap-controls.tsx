"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { proposeSwap, respondToSwap, cancelSwap } from "@/lib/actions/chore-swaps";
import { isActionError, type ActionResult } from "@/lib/action-result";
import { interpolate } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import type { SwapOffer } from "@/lib/actions/chore-swaps";
import type { Dictionary } from "@/lib/dictionary";

type Swappable = { assignmentId: string; choreName: string; assigneeName: string };

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

// Offering your chore to somebody else. Rotation is fair on average, but a
// given round can still hand you the one job you hate — and the answer to
// that shouldn't be to bend the fairness maths, just to let two people agree.
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

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {dict.chores.swapButton}
      </Button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-rule bg-card p-3">
      <p className="text-xs font-medium">{dict.chores.swapPick}</p>

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
              onClick={async () => {
                setPending(true);
                setError(null);
                const ok = await run(
                  () =>
                    proposeSwap({
                      myAssignmentId,
                      theirAssignmentId: other.assignmentId,
                    }),
                  setError,
                );
                setPending(false);
                if (ok) {
                  setOpen(false);
                  router.refresh();
                }
              }}
            >
              {other.choreName} — {other.assigneeName}
            </Button>
          ))}
        </div>
      )}

      {/* Says why trading is safe, since the obvious worry is that dodging a
          job makes you look better on the fairness bars. It doesn't. */}
      <p className="text-[0.7rem] text-muted-foreground">{dict.chores.swapNote}</p>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button variant="ghost" size="sm" className="self-start" onClick={() => setOpen(false)}>
        {pending ? dict.chores.swapSending : dict.chores.swapCancel}
      </Button>
    </div>
  );
}

// Live offers, both directions. Incoming ones can be answered; your own can
// be withdrawn.
export function SwapOffers({ offers, dict }: { offers: SwapOffer[]; dict: Dictionary }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (offers.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {offers.map((offer) => (
        <div
          key={offer.id}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-warm/50 bg-warm-surface/30 px-3 py-2 text-xs"
        >
          <span className="flex-1">
            {offer.incoming
              ? interpolate(dict.chores.swapIncoming, {
                  name: offer.fromName,
                  yours: offer.toChore,
                  theirs: offer.fromChore,
                })
              : interpolate(dict.chores.swapOutgoing, {
                  // The person you're waiting on is the one you asked, not
                  // yourself — this said "waiting on <you>" until it didn't.
                  name: offer.toName,
                  yours: offer.fromChore,
                  theirs: offer.toChore,
                })}
          </span>

          {offer.incoming ? (
            <>
              <Button
                size="sm"
                disabled={pendingId === offer.id}
                onClick={async () => {
                  setPendingId(offer.id);
                  setError(null);
                  const ok = await run(
                    () => respondToSwap({ swapId: offer.id, accept: true }),
                    setError,
                  );
                  setPendingId(null);
                  if (ok) router.refresh();
                }}
              >
                {dict.chores.swapAccept}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pendingId === offer.id}
                onClick={async () => {
                  setPendingId(offer.id);
                  setError(null);
                  const ok = await run(
                    () => respondToSwap({ swapId: offer.id, accept: false }),
                    setError,
                  );
                  setPendingId(null);
                  if (ok) router.refresh();
                }}
              >
                {dict.chores.swapDecline}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pendingId === offer.id}
              onClick={async () => {
                setPendingId(offer.id);
                setError(null);
                const ok = await run(() => cancelSwap(offer.id), setError);
                setPendingId(null);
                if (ok) router.refresh();
              }}
            >
              {dict.chores.swapWithdraw}
            </Button>
          )}
        </div>
      ))}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
