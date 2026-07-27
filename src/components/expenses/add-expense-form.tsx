"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addManualExpense } from "@/lib/actions/expenses";
import { toCents } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Dictionary } from "@/lib/dictionary";

type Member = { id: string; displayName: string };

export function AddExpenseForm({
  groupId,
  members,
  currentUserId,
  currency,
  dict,
}: {
  groupId: string;
  members: Member[];
  currentUserId: string;
  currency: string;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [paidById, setPaidById] = useState(currentUserId);
  const [participantIds, setParticipantIds] = useState<string[]>(
    members.map((m) => m.id),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleParticipant(id: string) {
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await addManualExpense({
        groupId,
        title,
        totalCents: toCents(Number(amount)),
        paidById,
        participantIds,
        splitType: "EQUAL",
      });
      router.push(`/groups/${groupId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.common.somethingWrong);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 max-w-sm">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={dict.expenses.groceriesPlaceholder}
        required
      />
      <Input
        type="number"
        step="0.01"
        min="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={`0.00 ${currency}`}
        required
      />
      <label className="text-sm text-muted-foreground">{dict.common.paidBy}</label>
      <select
        className="rounded-md border bg-background p-2 text-sm"
        value={paidById}
        onChange={(e) => setPaidById(e.target.value)}
      >
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName}
          </option>
        ))}
      </select>
      <label className="text-sm text-muted-foreground">{dict.expenses.splitBetween}</label>
      <div className="flex flex-col gap-1">
        {members.map((m) => (
          <label key={m.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={participantIds.includes(m.id)}
              onCheckedChange={() => toggleParticipant(m.id)}
            />
            {m.displayName}
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? dict.common.adding : dict.expenses.addExpenseButton}
      </Button>
    </form>
  );
}
