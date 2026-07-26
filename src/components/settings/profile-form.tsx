"use client";

import { useState } from "react";
import { updateProfile } from "@/lib/actions/profile";
import { toCents, fromCents } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ProfileForm({
  initialBudgetLimit,
  initialDietaryRestrictions,
  initialHomeLatitude,
  initialHomeLongitude,
}: {
  initialBudgetLimit: number | null;
  initialDietaryRestrictions: string[];
  initialHomeLatitude: number | null;
  initialHomeLongitude: number | null;
}) {
  const [budget, setBudget] = useState(
    initialBudgetLimit === null ? "" : String(fromCents(initialBudgetLimit)),
  );
  const [restrictions, setRestrictions] = useState(
    initialDietaryRestrictions.join(", "),
  );
  const [homeLatitude, setHomeLatitude] = useState(
    initialHomeLatitude === null ? "" : String(initialHomeLatitude),
  );
  const [homeLongitude, setHomeLongitude] = useState(
    initialHomeLongitude === null ? "" : String(initialHomeLongitude),
  );
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setSaved(false);
    await updateProfile({
      budgetLimitCents: budget.trim() === "" ? null : toCents(Number(budget)),
      dietaryRestrictions: restrictions
        .split(",")
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean),
      homeLatitude: homeLatitude.trim() === "" ? null : Number(homeLatitude),
      homeLongitude: homeLongitude.trim() === "" ? null : Number(homeLongitude),
    });
    setPending(false);
    setSaved(true);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 max-w-sm">
      <label className="text-sm text-muted-foreground">
        Monthly budget limit per proposal ($, optional)
      </label>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        placeholder="e.g. 25"
      />
      <label className="text-sm text-muted-foreground">
        Dietary restrictions (comma-separated, e.g. vegetarian, gluten-free)
      </label>
      <Input
        value={restrictions}
        onChange={(e) => setRestrictions(e.target.value)}
        placeholder="vegetarian, nut-free"
      />
      <label className="text-sm text-muted-foreground">
        Home coordinates (optional, used for the fair meeting point feature)
      </label>
      <div className="flex gap-2">
        <Input
          type="number"
          step="any"
          value={homeLatitude}
          onChange={(e) => setHomeLatitude(e.target.value)}
          placeholder="Latitude"
        />
        <Input
          type="number"
          step="any"
          value={homeLongitude}
          onChange={(e) => setHomeLongitude(e.target.value)}
          placeholder="Longitude"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {saved && <p className="text-sm text-muted-foreground">Saved.</p>}
    </form>
  );
}
