"use client";

import { useState } from "react";
import { getMonthlyRecap } from "@/lib/actions/recap";
import { Button } from "@/components/ui/button";

export function RecapView({ groupId }: { groupId: string }) {
  const [recap, setRecap] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onGenerate() {
    setPending(true);
    setRecap(null);
    try {
      const result = await getMonthlyRecap(groupId);
      setRecap(result);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 max-w-sm">
      <Button onClick={onGenerate} disabled={pending}>
        {pending ? "Generating…" : "Generate recap"}
      </Button>
      {recap && <p className="rounded-lg border p-3 text-sm">{recap}</p>}
    </div>
  );
}
