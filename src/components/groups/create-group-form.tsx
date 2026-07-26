"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGroup } from "@/lib/actions/groups";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CreateGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const group = await createGroup(name);
      router.push(`/groups/${group.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 max-w-sm">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. The Apartment"
        required
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create group"}
      </Button>
    </form>
  );
}
