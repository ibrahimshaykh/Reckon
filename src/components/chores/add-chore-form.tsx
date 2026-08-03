"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createChore } from "@/lib/actions/chores";
import { isActionError } from "@/lib/action-result";
import type { Dictionary } from "@/lib/dictionary";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { effortWord } from "@/lib/effort-text";

type Frequency = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";

export function AddChoreForm({ groupId, dict }: { groupId: string; dict: Dictionary }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [effortWeight, setEffortWeight] = useState("1");
  const [frequency, setFrequency] = useState<Frequency>("WEEKLY");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await createChore({
        groupId,
        name,
        effortWeight: Number(effortWeight),
        frequency,
      });
      // A refusal comes back as a value rather than an exception, so the
      // reason survives Next's redaction and the form can say it.
      if (isActionError(result)) {
        setError(result.error);
        return;
      }
      setName("");
      setEffortWeight("1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.common.somethingWrong);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3 rounded-lg border border-rule bg-card p-4">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={dict.chores.addNamePlaceholder}
        required
      />
      <div className="flex gap-2">
        <Input
          type="number"
          min="1"
          max="10"
          step="1"
          value={effortWeight}
          onChange={(e) => setEffortWeight(e.target.value)}
          placeholder={dict.chores.effortPlaceholder}
          className="w-24"
        />
        {/* Names the number as you pick it, so you can tell whether 10 is what
            you meant without having to learn the scale first. */}
        {Number(effortWeight) >= 1 && (
          <span className="self-center whitespace-nowrap text-xs text-muted-foreground">
            {effortWord(Number(effortWeight), dict)}
          </span>
        )}
        <select
          className="flex-1 rounded-md border bg-background p-2 text-sm"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
        >
          <option value="DAILY">{dict.chores.freqDaily}</option>
          <option value="WEEKLY">{dict.chores.freqWeekly}</option>
          <option value="BIWEEKLY">{dict.chores.freqBiweekly}</option>
          <option value="MONTHLY">{dict.chores.freqMonthly}</option>
        </select>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? dict.common.adding : dict.chores.addButton}
      </Button>
    </form>
  );
}
