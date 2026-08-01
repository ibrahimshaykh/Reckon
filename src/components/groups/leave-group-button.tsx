"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { leaveGroup } from "@/lib/actions/groups";
import { isActionError } from "@/lib/action-result";
import { interpolate } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/dictionary";

// Leaving is refused while money is outstanding, and the refusal explains
// which way — so the error is shown in place rather than as a bare failure.
// It's the most likely outcome of pressing this, not an edge case.
export function LeaveGroupButton({
  groupId,
  groupName,
  dict,
}: {
  groupId: string;
  groupName: string;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLeave() {
    if (!window.confirm(interpolate(dict.groupHub.leaveConfirm, { name: groupName }))) {
      return;
    }

    setPending(true);
    setError(null);

    const result = await leaveGroup(groupId);

    if (isActionError(result)) {
      setError(result.error);
      setPending(false);
      return;
    }

    router.push("/groups");
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="ghost" size="sm" disabled={pending} onClick={onLeave}>
        <LogOut className="size-3.5" />
        {pending ? dict.groupHub.leaving : dict.groupHub.leaveGroup}
      </Button>
      {error && <p className="max-w-prose text-xs text-destructive">{error}</p>}
    </div>
  );
}
