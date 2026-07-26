"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rotateChores } from "@/lib/actions/chores";
import { Button } from "@/components/ui/button";

type Chore = {
  id: string;
  name: string;
  effortWeight: number;
  frequency: string;
  currentAssignee: string | null;
  periodEnd: string | null;
  explanation: { steps: string[] } | null;
};

export function ChoreList({ groupId, chores }: { groupId: string; chores: Chore[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function onRotate() {
    setPending(true);
    setLastResult(null);
    try {
      const result = await rotateChores(groupId);
      setLastResult(
        result.created === 0
          ? "Nothing to rotate — every chore already has a current assignment."
          : `Assigned ${result.created} chore${result.created === 1 ? "" : "s"}.`,
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={onRotate} disabled={pending} size="sm" className="w-fit">
        {pending ? "Rotating…" : "Rotate now"}
      </Button>
      {lastResult && <p className="text-sm text-muted-foreground">{lastResult}</p>}
      {chores.length === 0 && (
        <p className="text-sm text-muted-foreground">No chores yet.</p>
      )}
      <ul className="flex flex-col gap-2">
        {chores.map((chore) => (
          <ChoreRow key={chore.id} chore={chore} />
        ))}
      </ul>
    </div>
  );
}

function ChoreRow({ chore }: { chore: Chore }) {
  const [showMath, setShowMath] = useState(false);

  return (
    <li className="rounded-lg border p-3 text-sm">
      <div className="flex items-center justify-between">
        <p>
          <strong>{chore.name}</strong> (effort {chore.effortWeight},{" "}
          {chore.frequency.toLowerCase()}) —{" "}
          {chore.currentAssignee ? `assigned to ${chore.currentAssignee}` : "unassigned"}
        </p>
        {chore.explanation && (
          <Button variant="ghost" size="sm" onClick={() => setShowMath((v) => !v)}>
            {showMath ? "Hide math" : "Show the math"}
          </Button>
        )}
      </div>
      {showMath && chore.explanation && (
        <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
          {chore.explanation.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ul>
      )}
    </li>
  );
}
