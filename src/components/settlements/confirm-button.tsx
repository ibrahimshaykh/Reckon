"use client";

import { useState } from "react";
import { confirmReceivedByToken } from "@/lib/actions/settlements";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/dictionary";

export function ConfirmButton({ token, dict }: { token: string; dict: Dictionary }) {
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");

  async function onClick() {
    setState("pending");
    await confirmReceivedByToken(token);
    setState("done");
  }

  if (state === "done") {
    return <p className="text-sm text-muted-foreground">{dict.confirm.confirmedThanks}</p>;
  }

  return (
    <Button disabled={state === "pending"} onClick={onClick}>
      {dict.confirm.yesReceived}
    </Button>
  );
}
