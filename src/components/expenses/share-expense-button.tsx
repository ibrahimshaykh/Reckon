"use client";

import { useState } from "react";
import { createGuestLink } from "@/lib/actions/guest";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ShareExpenseButton({ expenseId }: { expenseId: string }) {
  const [guestName, setGuestName] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);

  async function onGenerate() {
    if (!guestName.trim()) return;
    setPending(true);
    try {
      const path = await createGuestLink({ expenseId, guestName });
      setLink(`${window.location.origin}${path}`);
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Share
      </Button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border p-2">
      {!link ? (
        <>
          <Input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Guest's name"
          />
          <Button size="sm" disabled={pending} onClick={onGenerate}>
            {pending ? "Creating…" : "Create link"}
          </Button>
        </>
      ) : (
        <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
      )}
    </div>
  );
}
