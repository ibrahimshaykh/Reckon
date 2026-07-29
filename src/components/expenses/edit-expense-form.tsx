"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateExpense } from "@/lib/actions/expenses";
import { isActionError } from "@/lib/action-result";
import { fromCents, toCents } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useSketchpad } from "@/lib/stores/sketchpad";
import type { Dictionary } from "@/lib/dictionary";

type Member = { id: string; displayName: string };

export function EditExpenseForm({
  expense,
  members,
  currency,
  dict,
}: {
  expense: {
    id: string;
    groupId: string;
    title: string;
    totalCents: number;
    paidById: string;
    participantIds: string[];
    itemised: boolean;
  };
  members: Member[];
  currency: string;
  dict: Dictionary;
}) {
  const router = useRouter();
  const jot = useSketchpad((s) => s.jot);
  const [title, setTitle] = useState(expense.title);
  const [amount, setAmount] = useState(String(fromCents(expense.totalCents)));
  const [paidById, setPaidById] = useState(expense.paidById);
  const [participantIds, setParticipantIds] = useState<string[]>(expense.participantIds);
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

    const result = await updateExpense({
      expenseId: expense.id,
      title,
      paidById,
      // Omitted entirely for receipt expenses — sending them would be
      // rejected by the action, and the fields aren't shown either.
      ...(expense.itemised
        ? {}
        : { totalCents: toCents(Number(amount)), participantIds }),
    });

    if (isActionError(result)) {
      setError(result.error);
      setPending(false);
    } else {
      jot(`Edited "${title}"`);
      router.push(`/groups/${expense.groupId}`);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full flex-col gap-3 rounded-lg border border-rule bg-card p-4"
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={dict.expenses.groceriesPlaceholder}
        required
      />

      {expense.itemised ? (
        <p className="rounded-lg border border-warm/40 bg-warm-surface/40 p-2 text-xs">
          {dict.expenses.itemisedNote}
        </p>
      ) : (
        <Input
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`0.00 ${currency}`}
          required
        />
      )}

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

      {!expense.itemised && (
        <>
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
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? dict.expenses.saving : dict.expenses.saveChanges}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.push(`/groups/${expense.groupId}`)}
        >
          {dict.common.cancel}
        </Button>
      </div>
    </form>
  );
}
