"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { forgiveIOU } from "@/lib/actions/ious";
import { formatMoney } from "@/lib/money";
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
}: {
  ious: IOU[];
  currentUserId: string;
  currency: string;
}) {
  if (ious.length === 0) {
    return <p className="text-sm text-muted-foreground">No IOUs yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {ious.map((i) => (
        <IOURow key={i.id} iou={i} currentUserId={currentUserId} currency={currency} />
      ))}
    </ul>
  );
}

function IOURow({
  iou: i,
  currentUserId,
  currency,
}: {
  iou: IOU;
  currentUserId: string;
  currency: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const canForgive = i.toUserId === currentUserId && !i.forgivenAt;

  async function onForgive() {
    setPending(true);
    await forgiveIOU(i.id);
    setPending(false);
    router.refresh();
  }

  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-sm ${
        i.forgivenAt ? "opacity-50" : ""
      }`}
    >
      <p className={i.forgivenAt ? "line-through" : ""}>
        <strong>{i.fromName}</strong> owes <strong>{i.toName}</strong>{" "}
        {formatMoney(Math.round(i.amount * 100), currency)}
        {i.note && ` — ${i.note}`}
      </p>
      {i.forgivenAt ? (
        <span className="shrink-0 text-xs text-muted-foreground">Forgiven</span>
      ) : (
        canForgive && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={onForgive}
            className="shrink-0"
          >
            Forgive
          </Button>
        )
      )}
    </li>
  );
}
