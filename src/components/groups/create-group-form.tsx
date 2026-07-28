"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGroup } from "@/lib/actions/groups";
import type { Dictionary } from "@/lib/dictionary";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CreateGroupForm({ dict }: { dict: Dictionary }) {
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
      setError(err instanceof Error ? err.message : dict.common.somethingWrong);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3 rounded-lg border border-rule bg-card p-4">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={dict.groupHub.createGroupPlaceholder}
        required
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? dict.groupHub.creatingGroup : dict.groupHub.createGroupButton}
      </Button>
    </form>
  );
}
