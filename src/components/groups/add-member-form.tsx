"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addMemberByEmail } from "@/lib/actions/groups";
import type { Dictionary } from "@/lib/dictionary";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AddMemberForm({ groupId, dict }: { groupId: string; dict: Dictionary }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await addMemberByEmail(groupId, email);
      setEmail("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.common.somethingWrong);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={dict.groupHub.addMemberPlaceholder}
        required
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? dict.common.adding : dict.groupHub.addMemberButton}
      </Button>
    </form>
  );
}
