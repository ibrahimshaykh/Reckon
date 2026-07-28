"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { forgiveIOU } from "@/lib/actions/ious";
import { isActionError } from "@/lib/action-result";
import { formatMoney } from "@/lib/money";
import type { Dictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

type IOU = {
  id: string;
  toUserId: string;
  fromName: string;
  toName: string;
  amount: number;
  note: string | null;
  forgivenAt: string | null;
};

export function IOUList({
  ious,
  currentUserId,
  currency,
  dict,
}: {
  ious: IOU[];
  currentUserId: string;
  currency: string;
  dict: Dictionary;
}) {
  if (ious.length === 0) {
    return <p className="text-sm text-muted-foreground">{dict.ious.noIousYet}</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {ious.map((i) => (
        <IOURow key={i.id} iou={i} currentUserId={currentUserId} currency={currency} dict={dict} />
      ))}
    </ul>
  );
}

function IOURow({
  iou: i,
  currentUserId,
  currency,
  dict,
}: {
  iou: IOU;
  currentUserId: string;
  currency: string;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canForgive = i.toUserId === currentUserId && !i.forgivenAt;

  async function onForgive() {
    setPending(true);
    setError(null);
    const result = await forgiveIOU(i.id);
    setPending(false);
    if (isActionError(result)) {
      setError(result.error);
    } else {
      router.refresh();
    }
  }

  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-sm ${
        i.forgivenAt ? "opacity-50" : ""
      }`}
    >
      <p className={i.forgivenAt ? "line-through" : ""}>
        {interpolate(dict.ious.owesLine, {
          fromName: i.fromName,
          toName: i.toName,
          amount: formatMoney(Math.round(i.amount * 100), currency),
        })}
        {i.note && ` — ${i.note}`}
      </p>
      {error && <span className="shrink-0 text-xs text-destructive">{error}</span>}
      {i.forgivenAt ? (
        <span className="shrink-0 text-xs text-muted-foreground">{dict.ious.forgiven}</span>
      ) : (
        canForgive && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={onForgive}
            className="shrink-0"
          >
            {dict.ious.forgiveButton}
          </Button>
        )
      )}
    </li>
  );
}
