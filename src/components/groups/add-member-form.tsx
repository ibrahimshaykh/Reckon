"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addMemberByEmail } from "@/lib/actions/groups";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AddMemberForm({ groupId }: { groupId: string }) {
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
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
        placeholder="friend@example.com"
        required
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}
