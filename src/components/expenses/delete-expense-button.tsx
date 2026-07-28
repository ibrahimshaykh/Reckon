"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteExpense } from "@/lib/actions/expenses";
import type { Dictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";

// Deleting rewrites what everyone in the group owes, so the destructive step
// is deliberately two-stage: the icon arms it, and a second, explicit click
// carries it out. No modal — inline keeps the affected row in view while you
// decide.
export function DeleteExpenseButton({
  expenseId,
  title,
  dict,
}: {
  expenseId: string;
  title: string;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setPending(true);
    setError(null);
    try {
      await deleteExpense(expenseId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.common.somethingWrong);
      setPending(false);
      setArmed(false);
    }
  }

  if (error) {
    return <span className="text-xs text-destructive">{error}</span>;
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        aria-label={interpolate(dict.groupHub.confirmDeleteExpense, { title })}
        title={dict.groupHub.deleteExpense}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? dict.groupHub.deleting : dict.groupHub.deleteExpense}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        disabled={pending}
        className="rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {dict.common.cancel}
      </button>
    </span>
  );
}
