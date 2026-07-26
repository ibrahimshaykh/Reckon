"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProposal } from "@/lib/actions/proposals";
import { toCents } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AddProposalForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("");
  const [dietaryTags, setDietaryTags] = useState("");
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
      });
      setTitle("");
      setCost("");
      setDietaryTags("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 max-w-sm">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Pizza night at Mario's"
        required
      />
      <Input
        type="number"
        step="0.01"
        min="0"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        placeholder="Estimated cost per person ($, optional)"
      />
      <Input
        value={dietaryTags}
        onChange={(e) => setDietaryTags(e.target.value)}
        placeholder="Covers (comma-separated, e.g. vegetarian)"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add proposal"}
      </Button>
    </form>
  );
}
