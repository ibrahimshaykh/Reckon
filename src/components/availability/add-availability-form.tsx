"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addAvailability } from "@/lib/actions/availability";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AddAvailabilityForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await addAvailability({ groupId, startsAt, endsAt, label: label || undefined });
      setStartsAt("");
      setEndsAt("");
      setLabel("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 max-w-sm">
      <label className="text-sm text-muted-foreground">I&apos;m free from</label>
      <Input
        type="datetime-local"
        value={startsAt}
        onChange={(e) => setStartsAt(e.target.value)}
        required
      />
      <label className="text-sm text-muted-foreground">until</label>
      <Input
        type="datetime-local"
        value={endsAt}
        onChange={(e) => setEndsAt(e.target.value)}
        required
      />
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (optional)"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add availability"}
      </Button>
    </form>
  );
}
