"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { addGuest } from "@/lib/actions/guest";
import { isActionError } from "@/lib/action-result";
import type { Dictionary } from "@/lib/dictionary";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useSketchpad } from "@/lib/stores/sketchpad";

export function ShareExpenseButton({
  expenseId,
  expenseTitle,
  participants,
  currentUserId,
  dict,
}: {
  expenseId: string;
  expenseTitle?: string;
  /** Who's in this expense — only they can be put down as covering a guest. */
  participants: { id: string; name: string }[];
  currentUserId: string;
  dict: Dictionary;
}) {
  const jot = useSketchpad((s) => s.jot);
  const [guestName, setGuestName] = useState("");
  // Whoever's adding the guest is the obvious default host: in practice you
  // invite your own plus-one. Still editable — sometimes it's the flatmate's.
  const [hostIds, setHostIds] = useState<string[]>(() =>
    participants.some((p) => p.id === currentUserId) ? [currentUserId] : [],
  );
  const [link, setLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function toggleHost(id: string) {
    setHostIds((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id],
    );
  }

  async function onGenerate() {
    if (!guestName.trim()) return;
    if (hostIds.length === 0) {
      setError(dict.expenses.guestPickHostsFirst);
      return;
    }

    setPending(true);
    setError(null);

    const result = await addGuest({ expenseId, name: guestName, hostIds });

    if (isActionError(result)) {
      setError(result.error);
    } else {
      setLink(`${window.location.origin}${result.url}`);
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
    // Shadowed and clearly lifted off the row: this panel sits directly above
    // the list of guests already on the expense, and without a hard edge the
    // two read as one block — as though the checkboxes described the guest
    // listed underneath rather than the new one being created.
    <div className="relative mt-2 flex w-full flex-col gap-2 rounded-lg border-2 border-rule bg-card p-3 pe-8 shadow-md">
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
          <p className="text-xs font-medium">{dict.expenses.shareTooltip}</p>
          <Input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder={dict.expenses.guestNamePlaceholder}
          />

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs font-medium">
              {dict.expenses.guestHostsLabel}
            </legend>
            <p className="mb-1 text-xs text-muted-foreground">
              {dict.expenses.guestHostsHint}
            </p>
            {participants.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={hostIds.includes(p.id)}
                  onCheckedChange={() => toggleHost(p.id)}
                />
                {p.name}
              </label>
            ))}
          </fieldset>

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
