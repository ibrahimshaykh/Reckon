"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildPayLink, type PayProvider } from "@/lib/pay-links";

type Settlement = {
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  amountCents: number;
  explanation: { steps: string[] };
};

export function SettlementList({
  settlements,
  currentUserId,
}: {
  settlements: Settlement[];
  currentUserId: string;
}) {
  if (settlements.length === 0) {
    return <p className="text-sm text-muted-foreground">Everyone&apos;s settled up.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {settlements.map((s, i) => (
        <SettlementRow key={i} settlement={s} currentUserId={currentUserId} />
      ))}
    </ul>
  );
}

function SettlementRow({
  settlement,
  currentUserId,
}: {
  settlement: Settlement;
  currentUserId: string;
}) {
  const [showMath, setShowMath] = useState(false);
  const [handle, setHandle] = useState("");

  const amount = (settlement.amountCents / 100).toFixed(2);
  const isPayer = settlement.fromUserId === currentUserId;

  function pay(provider: PayProvider) {
    if (!handle.trim()) return;
    const url = buildPayLink(provider, {
      handle,
      amountCents: settlement.amountCents,
      note: `Reckon settle-up`,
    });
    window.open(url, "_blank");
  }

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm">
          <strong>{settlement.fromName}</strong> owes{" "}
          <strong>{settlement.toName}</strong> ${amount}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setShowMath((v) => !v)}>
          {showMath ? "Hide math" : "Show the math"}
        </Button>
      </div>
      {showMath && (
        <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
          {settlement.explanation.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ul>
      )}
      {isPayer && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@their-handle"
            className="max-w-40"
          />
          <Button size="sm" onClick={() => pay("venmo")}>Venmo</Button>
          <Button size="sm" onClick={() => pay("paypal")}>PayPal</Button>
          <Button size="sm" onClick={() => pay("cashapp")}>Cash App</Button>
        </div>
      )}
    </li>
  );
}
