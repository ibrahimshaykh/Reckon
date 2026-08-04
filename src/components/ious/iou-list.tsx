"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { forgiveIOU } from "@/lib/actions/ious";
import { isActionError } from "@/lib/action-result";
import { formatMoney } from "@/lib/money";
import type { Dictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    // Slips, so they need room to sit apart from each other. Packed at gap-1
    // they read as one table of rows, which is the wrong idea: each of these
    // is a separate promise between two people.
    <ul className="flex flex-col gap-2.5">
      {ious.map((i, index) => (
        <IOURow
          key={i.id}
          iou={i}
          index={index}
          currentUserId={currentUserId}
          currency={currency}
          dict={dict}
        />
      ))}
    </ul>
  );
}

function IOURow({
  iou: i,
  index,
  currentUserId,
  currency,
  dict,
}: {
  iou: IOU;
  index: number;
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
    // An IOU is a scrap of paper somebody wrote and handed over, so it is
    // drawn as one. Alternating the two box shapes keeps a stack of them from
    // looking die-cut; open ones are inked in the section's own green, and a
    // forgiven one loses that ink because it is no longer a live promise.
    <li
      style={i.forgivenAt ? undefined : { borderColor: "var(--feature-ious)" }}
      className={cn(
        index % 2 === 0 ? "sketch-box" : "sketch-box-alt",
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-card p-3 text-sm",
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className={cn("min-w-0", i.forgivenAt && "text-muted-foreground line-through")}>
          {interpolate(dict.ious.owesLine, {
            fromName: i.fromName,
            toName: i.toName,
            amount: formatMoney(Math.round(i.amount * 100), currency),
          })}
        </p>
        {/* Given its own line rather than run into the sentence after a dash.
            What the debt was for is the part people actually argue about, and
            trailing it off the end of the amount buried it. */}
        {i.note && <p className="text-xs text-muted-foreground">{i.note}</p>}
      </div>
      {error && <span className="shrink-0 text-xs text-destructive">{error}</span>}
      {i.forgivenAt ? (
        <span className="stamp shrink-0 text-positive">{dict.ious.forgiven}</span>
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
