"use client";

import { useState } from "react";
import { confirmReceivedByToken } from "@/lib/actions/settlements";
import { isActionError } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/dictionary";

export function ConfirmButton({ token, dict }: { token: string; dict: Dictionary }) {
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setState("pending");
    setError(null);
    const result = await confirmReceivedByToken(token);
    if (isActionError(result)) {
      // An expired or already-used link is the common case here, and the
      // reason matters — silently resetting the button would leave someone
      // clicking it forever with no idea why nothing happens.
      setError(result.error);
      setState("idle");
    } else {
      setState("done");
    }
  }

  if (state === "done") {
    return <p className="text-sm text-muted-foreground">{dict.confirm.confirmedThanks}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={state === "pending"} onClick={onClick}>
        {dict.confirm.yesReceived}
      </Button>
    </div>
  );
}
