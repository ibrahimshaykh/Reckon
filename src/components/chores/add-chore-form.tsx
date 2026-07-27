"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createChore } from "@/lib/actions/chores";
import type { Dictionary } from "@/lib/dictionary";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
      await createChore({
        groupId,
        name,
        effortWeight: Number(effortWeight),
        frequency,
      });
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
    <form onSubmit={onSubmit} className="flex flex-col gap-2 max-w-sm">
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
          step="1"
          value={effortWeight}
          onChange={(e) => setEffortWeight(e.target.value)}
          placeholder={dict.chores.effortPlaceholder}
          className="w-24"
        />
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
