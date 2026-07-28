"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addMemberByEmail } from "@/lib/actions/groups";
import { isActionError } from "@/lib/action-result";
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
    const result = await addMemberByEmail(groupId, email);
    if (isActionError(result)) {
      setError(result.error);
    } else {
      setEmail("");
      router.refresh();
    }
    setPending(false);
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
