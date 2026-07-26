"use client";

import { useState } from "react";
import { confirmReceivedByToken } from "@/lib/actions/settlements";
import { Button } from "@/components/ui/button";

export function ConfirmButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");

  async function onClick() {
    setState("pending");
    await confirmReceivedByToken(token);
    setState("done");
  }

  if (state === "done") {
    return <p className="text-sm text-muted-foreground">Thanks — marked as confirmed!</p>;
  }

  return (
    <Button disabled={state === "pending"} onClick={onClick}>
      Yes, I received this
    </Button>
  );
}
