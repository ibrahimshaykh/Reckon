"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  confirmGuestPaid,
  refreshGuestLink,
  rejectGuestPayment,
  removeGuest,
  setGuestHosts,
} from "@/lib/actions/guest";
import { isActionError, type ActionResult } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useSketchpad } from "@/lib/stores/sketchpad";
import type { Dictionary } from "@/lib/dictionary";

type Guest = {
  id: string;
  name: string;
  status: "UNDECIDED" | "PAYING" | "SENT" | "PAID" | "DECLINED";
  hostIds: string[];
  hostNames: string[];
  hostsAssumed: boolean;
  /** Their hosts have squared up, so nobody is waiting on this guest. */
  covered: boolean;
};

// Guests attached to one expense, and where each of them stands. The status
// wording is deliberately plain — "hasn't answered" rather than UNDECIDED —
// because this line is how the group finds out who's actually covering what.
export function GuestList({
  guests,
  participants,
  isPayer,
  dict,
}: {
  guests: Guest[];
  /** Only people in the split can be put down as covering a guest. */
  participants: { id: string; name: string }[];
  /** Only the person who fronted the money can say it arrived. */
  isPayer: boolean;
  dict: Dictionary;
}) {
  const router = useRouter();
  const jot = useSketchpad((s) => s.jot);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; hostIds: string[] } | null>(null);

  const statusLabel: Record<Guest["status"], string> = {
    UNDECIDED: dict.expenses.guestStatusUndecided,
    PAYING: dict.expenses.guestStatusPaying,
    // The one status that asks something of the reader: go and check.
    SENT: dict.expenses.guestStatusSent,
    PAID: dict.expenses.guestStatusPaid,
    DECLINED: dict.expenses.guestStatusDeclined,
  };

  async function run(
    id: string,
    action: () => Promise<ActionResult<void>>,
    onSuccess: () => void,
  ) {
    setPendingId(id);
    setError(null);

    const result = await action();

    if (isActionError(result)) {
      setError(result.error);
      setPendingId(null);
      return;
    }

    onSuccess();
    setPendingId(null);
    router.refresh();
  }

  // Copies straight to the clipboard rather than revealing another link box.
  // A second box sitting under the "create link" panel read as two competing
  // ways to do the same thing.
  async function copyLink(guest: Guest) {
    setPendingId(guest.id);
    setError(null);

    const result = await refreshGuestLink(guest.id);

    if (isActionError(result)) {
      setError(result.error);
      setPendingId(null);
      return;
    }

    const url = `${window.location.origin}${result.url}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(guest.id);
      window.setTimeout(() => setCopiedId(null), 2500);
    } catch {
      // Clipboard is blocked in some browsers unless the page is focused —
      // falling back to a prompt beats silently doing nothing.
      window.prompt(dict.expenses.guestLinkCopied, url);
    }
    setPendingId(null);
  }

  return (
    <div className="flex flex-col gap-2 border-s-2 border-rule/50 ps-3">
      {guests.map((g) => {
        const isEditing = editing?.id === g.id;

        return (
          <div key={g.id} className="flex flex-col gap-1 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{g.name}</span>{" "}
                {statusLabel[g.status]}
                {/* Who's on the hook is the whole point of hosts, so say it
                    rather than making people open the expense to find out. */}
                {g.status !== "PAID" && g.hostNames.length > 0 && (
                  <>
                    {" · covered by "}
                    {g.hostNames.join(" & ")}
                    {/* Never dress up an inferred host as a decision. The
                        leading space is load-bearing: without it the badge
                        reads as "...example.comassumed" to a screen reader,
                        which the visual margin hides. */}
                    {g.hostsAssumed && (
                      <>
                        {" "}
                        <span
                          title={dict.expenses.guestAssumedHint}
                          className="rounded-sm bg-warm-surface/60 px-1 py-px text-[0.65rem] text-muted-foreground"
                        >
                          {dict.expenses.guestHostsAssumed}
                        </span>
                      </>
                    )}
                  </>
                )}
              </span>

              {/* Says the book is closed on this one. Without it the row kept
                  offering to chase somebody whose share the group had already
                  covered and squared up between themselves. */}
              {g.covered && (
                <span className="text-muted-foreground">
                  {dict.expenses.guestCovered}
                </span>
              )}

              {/* Offered from "says they'll pay" onwards, not only once they
                  claim to have sent it: money often arrives before anybody
                  presses anything, and the payer should not have to wait for
                  the guest to catch up before recording what they can see in
                  their own account.

                  Demoted to a plain link once covered. Money can still turn up
                  from a guest who said they would pay, so there has to be
                  somewhere to record it — but it is no longer the thing this
                  row is asking anybody to do. */}
              {isPayer && (g.status === "PAYING" || g.status === "SENT") && (
                g.covered ? (
                  <button
                    type="button"
                    disabled={pendingId === g.id}
                    onClick={() =>
                      run(g.id, () => confirmGuestPaid(g.id), () =>
                        jot(`${g.name} paid up`),
                      )
                    }
                    className="text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    {dict.expenses.guestConfirmPaid}
                  </button>
                ) : (
                  <Button
                    size="sm"
                    variant={g.status === "SENT" ? "default" : "outline"}
                    disabled={pendingId === g.id}
                    onClick={() =>
                      run(g.id, () => confirmGuestPaid(g.id), () =>
                        jot(`${g.name} paid up`),
                      )
                    }
                  >
                    {dict.expenses.guestConfirmPaid}
                  </Button>
                )
              )}

              {/* The answer to a claim that turns out to be wrong. Offered only
                  against an actual claim: there is nothing to reject from
                  somebody who has merely said they intend to pay. */}
              {isPayer && g.status === "SENT" && (
                <button
                  type="button"
                  disabled={pendingId === g.id}
                  onClick={() =>
                    run(g.id, () => rejectGuestPayment(g.id), () =>
                      jot(`${g.name}'s payment didn't arrive`),
                    )
                  }
                  className="text-muted-foreground underline underline-offset-2 transition-colors hover:text-destructive disabled:opacity-50"
                >
                  {dict.expenses.guestNotReceived}
                </button>
              )}

              {g.status !== "PAID" && (
                <button
                  type="button"
                  disabled={pendingId === g.id}
                  onClick={() =>
                    setEditing(isEditing ? null : { id: g.id, hostIds: g.hostIds })
                  }
                  className="text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {dict.expenses.guestChangeHosts}
                </button>
              )}

              {/* Links expire after 30 days, and a guest who takes longer than
                  that used to hit a dead page with no way back.

                  Not offered once they are covered: the link is for chasing
                  somebody, and there is nobody left to chase. */}
              {g.status !== "PAID" && !g.covered && (
                <button
                  type="button"
                  disabled={pendingId === g.id}
                  onClick={() => copyLink(g)}
                  className="text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {copiedId === g.id
                    ? dict.expenses.guestLinkCopiedShort
                    : dict.expenses.guestGetLink}
                </button>
              )}

              {/* Nobody with money in flight can be removed — SENT included,
                  or their transfer arrives against a row that no longer
                  exists. */}
              {g.status !== "PAYING" &&
                g.status !== "SENT" &&
                g.status !== "PAID" && (
                <button
                  type="button"
                  disabled={pendingId === g.id}
                  aria-label={`${dict.expenses.guestRemove} ${g.name}`}
                  title={dict.expenses.guestRemove}
                  onClick={() =>
                    run(g.id, () => removeGuest(g.id), () =>
                      jot(`Removed guest ${g.name}`),
                    )
                  }
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            {isEditing && (
              <div className="flex flex-col gap-1 rounded-md border border-rule bg-card p-2">
                <p className="text-[0.7rem] text-muted-foreground">
                  {g.hostsAssumed
                    ? dict.expenses.guestAssumedHint
                    : dict.expenses.guestHostsHint}
                </p>
                {participants.map((p) => (
                  <label key={p.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={editing.hostIds.includes(p.id)}
                      onCheckedChange={() =>
                        setEditing({
                          id: g.id,
                          hostIds: editing.hostIds.includes(p.id)
                            ? editing.hostIds.filter((h) => h !== p.id)
                            : [...editing.hostIds, p.id],
                        })
                      }
                    />
                    {p.name}
                  </label>
                ))}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={pendingId === g.id || editing.hostIds.length === 0}
                    onClick={() =>
                      run(
                        g.id,
                        () => setGuestHosts({ guestId: g.id, hostIds: editing.hostIds }),
                        () => {
                          jot(`Set who covers ${g.name}`);
                          setEditing(null);
                        },
                      )
                    }
                  >
                    {dict.expenses.guestSaveHosts}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                    {dict.common.cancel}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
