"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addIOU } from "@/lib/actions/ious";
import { isActionError } from "@/lib/action-result";
import { toCents, formatMoney } from "@/lib/money";
import type { Dictionary } from "@/lib/dictionary";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Member = { id: string; displayName: string };

const AMOUNT_PRESETS = [5, 10, 20];

export function AddIOUForm({
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
  const others = members.filter((m) => m.id !== currentUserId);
  const [owedByUserId, setOwedByUserId] = useState(others[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryChips = [
    { emoji: "☕", label: dict.ious.categoryCoffee },
    { emoji: "⛽", label: dict.ious.categoryGas },
    { emoji: "🍕", label: dict.ious.categoryFood },
    { emoji: "🏠", label: dict.ious.categoryRent },
    { emoji: "💸", label: dict.ious.categoryMisc },
  ];

  function onPickCategory(emoji: string, label: string) {
    setNote((current) => (current ? current : `${emoji} ${label}`));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await addIOU({
      groupId,
      owedByUserId,
      amountCents: toCents(Number(amount)),
      note: note || undefined,
    });
    if (isActionError(result)) {
      setError(result.error);
    } else {
      setAmount("");
      setNote("");
      router.refresh();
    }
    setPending(false);
  }

  if (others.length === 0) {
    return <p className="text-sm text-muted-foreground">{dict.ious.needAnotherMember}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3 rounded-lg border border-rule bg-card p-4">
      <label className="text-sm text-muted-foreground">{dict.ious.iLent}</label>
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
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={dict.ious.amountPlaceholder}
          required
          className="flex-1"
        />
        {AMOUNT_PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={amount === String(preset) ? "secondary" : "outline"}
            onClick={() => setAmount(String(preset))}
          >
            {formatMoney(preset * 100, currency)}
          </Button>
        ))}
      </div>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={dict.ious.notePlaceholder}
      />
      <div className="flex flex-wrap gap-1">
        {categoryChips.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onPickCategory(c.emoji, c.label)}
            className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? dict.common.adding : dict.ious.addButton}
      </Button>
    </form>
  );
}
