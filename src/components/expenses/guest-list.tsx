"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { confirmGuestPaid, refreshGuestLink, removeGuest } from "@/lib/actions/guest";
import { isActionError, type ActionResult } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { useSketchpad } from "@/lib/stores/sketchpad";
import type { Dictionary } from "@/lib/dictionary";

type Guest = {
  id: string;
  name: string;
  status: "UNDECIDED" | "PAYING" | "PAID" | "DECLINED";
  hostNames: string[];
};

// Guests attached to one expense, and where each of them stands. The status
// wording is deliberately plain — "hasn't answered" rather than UNDECIDED —
// because this line is how the group finds out who's actually covering what.
export function GuestList({
  guests,
  isPayer,
  dict,
}: {
  guests: Guest[];
  /** Only the person who fronted the money can say it arrived. */
  isPayer: boolean;
  dict: Dictionary;
}) {
  const router = useRouter();
  const jot = useSketchpad((s) => s.jot);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [freshLink, setFreshLink] = useState<{ id: string; url: string } | null>(null);

  const statusLabel: Record<Guest["status"], string> = {
    UNDECIDED: dict.expenses.guestStatusUndecided,
    PAYING: dict.expenses.guestStatusPaying,
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

  return (
    <div className="flex flex-col gap-1 ps-4">
      {guests.map((g) => (
        <div key={g.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{g.name}</span>{" "}
            {statusLabel[g.status]}
            {/* Who's on the hook is the whole point of hosts, so say it
                rather than making people open the expense to find out. */}
            {g.status !== "PAID" && g.hostNames.length > 0 && (
              <> · covered by {g.hostNames.join(" & ")}</>
            )}
          </span>

          {isPayer && g.status === "PAYING" && (
            <Button
              size="sm"
              variant="outline"
              disabled={pendingId === g.id}
              onClick={() =>
                run(g.id, () => confirmGuestPaid(g.id), () =>
                  jot(`${g.name} paid up`),
                )
              }
            >
              {dict.expenses.guestConfirmPaid}
            </Button>
          )}

          {/* Links expire after 30 days, and a guest who takes longer than
              that used to hit a dead page with no way back. */}
          {g.status !== "PAID" && (
            <button
              type="button"
              disabled={pendingId === g.id}
              onClick={async () => {
                setPendingId(g.id);
                setError(null);
                const result = await refreshGuestLink(g.id);
                if (isActionError(result)) setError(result.error);
                else setFreshLink({ id: g.id, url: `${window.location.origin}${result.url}` });
                setPendingId(null);
              }}
              className="text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-50"
            >
              {dict.expenses.guestGetLink}
            </button>
          )}

          {g.status !== "PAYING" && g.status !== "PAID" && (
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

          {freshLink?.id === g.id && (
            <input
              readOnly
              value={freshLink.url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={dict.expenses.guestLinkCopied}
              className="w-full rounded-md border border-rule bg-background px-2 py-1 font-mono text-[0.7rem]"
            />
          )}
        </div>
      ))}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
