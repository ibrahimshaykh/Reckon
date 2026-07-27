"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProposal } from "@/lib/actions/proposals";
import { toCents } from "@/lib/money";
import type { Dictionary } from "@/lib/dictionary";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AddProposalForm({ groupId, dict }: { groupId: string; dict: Dictionary }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("");
  const [dietaryTags, setDietaryTags] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await createProposal({
        groupId,
        title,
        estimatedCostPerPersonCents: cost.trim() === "" ? null : toCents(Number(cost)),
        dietaryTags: dietaryTags
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
        latitude: latitude.trim() === "" ? null : Number(latitude),
        longitude: longitude.trim() === "" ? null : Number(longitude),
      });
      setTitle("");
      setCost("");
      setDietaryTags("");
      setLatitude("");
      setLongitude("");
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
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={dict.proposals.titlePlaceholder}
        required
      />
      <Input
        type="number"
        step="0.01"
        min="0"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        placeholder={dict.proposals.costPlaceholder}
      />
      <Input
        value={dietaryTags}
        onChange={(e) => setDietaryTags(e.target.value)}
        placeholder={dict.proposals.dietaryPlaceholder}
      />
      <div className="flex gap-2">
        <Input
          type="number"
          step="any"
          value={latitude}
          onChange={(e) => setLatitude(e.target.value)}
          placeholder={dict.proposals.latPlaceholder}
        />
        <Input
          type="number"
          step="any"
          value={longitude}
          onChange={(e) => setLongitude(e.target.value)}
          placeholder={dict.proposals.lngPlaceholder}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? dict.common.adding : dict.proposals.addButton}
      </Button>
    </form>
  );
}
