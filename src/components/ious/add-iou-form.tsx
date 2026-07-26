"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addIOU } from "@/lib/actions/ious";
import { toCents } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Member = { id: string; displayName: string };

export function AddIOUForm({
  groupId,
  members,
  currentUserId,
}: {
  groupId: string;
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const others = members.filter((m) => m.id !== currentUserId);
  const [owedByUserId, setOwedByUserId] = useState(others[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await addIOU({
        groupId,
        owedByUserId,
        amountCents: toCents(Number(amount)),
        note: note || undefined,
      });
      setAmount("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  if (others.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add another member to the group before recording an IOU.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 max-w-sm">
      <label className="text-sm text-muted-foreground">I lent</label>
      <select
        className="rounded-md border bg-background p-2 text-sm"
        value={owedByUserId}
        onChange={(e) => setOwedByUserId(e.target.value)}
      >
        {others.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName}
          </option>
        ))}
      </select>
      <Input
        type="number"
        step="0.01"
        min="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount ($)"
        required
      />
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add IOU"}
      </Button>
    </form>
  );
}
