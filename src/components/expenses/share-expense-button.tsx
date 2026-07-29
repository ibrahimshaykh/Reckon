"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createGuestLink } from "@/lib/actions/guest";
import { isActionError } from "@/lib/action-result";
import type { Dictionary } from "@/lib/dictionary";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSketchpad } from "@/lib/stores/sketchpad";

export function ShareExpenseButton({
  expenseId,
  expenseTitle,
  dict,
}: {
  expenseId: string;
  expenseTitle?: string;
  dict: Dictionary;
}) {
  const jot = useSketchpad((s) => s.jot);
  const [guestName, setGuestName] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function onGenerate() {
    if (!guestName.trim()) return;
    setPending(true);
    setError(null);
    const path = await createGuestLink({ expenseId, guestName });
    if (isActionError(path)) {
      setError(path.error);
    } else {
      setLink(`${window.location.origin}${path}`);
      // Record it in the margin — sharing is exactly the sort of thing you
      // want evidence of three screens later.
      jot(`Shared "${expenseTitle ?? "expense"}" with ${guestName.trim()}`);
    }
    setPending(false);
  }

  function close() {
    setOpen(false);
    setLink(null);
    setGuestName("");
    setError(null);
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        // "Share" alone doesn't say who it's for. The tooltip answers the
        // question people actually have: why would I use this instead of
        // just adding them to the group?
        title={dict.expenses.shareTooltip}
      >
        {dict.expenses.shareButton}
      </Button>
    );
  }

  return (
    <div className="relative mt-2 flex flex-col gap-2 rounded-lg border p-2 pe-8">
      {/* Once opened there was no way back out without reloading the page. */}
      <button
        type="button"
        onClick={close}
        aria-label={dict.expenses.closeShare}
        title={dict.expenses.closeShare}
        className="absolute end-1 top-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="size-3.5" />
      </button>

      {!link ? (
        <>
          <Input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder={dict.expenses.guestNamePlaceholder}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button size="sm" disabled={pending} onClick={onGenerate}>
            {pending ? dict.expenses.creatingLink : dict.expenses.createLinkButton}
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{dict.expenses.guestLinkReady}</p>
          <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        </>
      )}
    </div>
  );
}
