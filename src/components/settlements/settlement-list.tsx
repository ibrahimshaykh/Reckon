"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markPaid, confirmReceived } from "@/lib/actions/settlements";
import { Button } from "@/components/ui/button";
import { CopyRow } from "@/components/copy-row";
import { buildPayLink, type PayProvider } from "@/lib/pay-links";

type Settlement = {
  id: string;
  status: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  amountCents: number;
  toVenmoHandle: string | null;
  toPaypalHandle: string | null;
  toCashappHandle: string | null;
  toEasypaisaNumber: string | null;
  toJazzcashNumber: string | null;
  toNayapayHandle: string | null;
  toBankDetails: string | null;
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
      {settlements.map((s) => (
        <SettlementRow key={s.id} settlement={s} currentUserId={currentUserId} />
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
  const router = useRouter();
  const [showMath, setShowMath] = useState(false);
  const [pending, setPending] = useState(false);

  const amount = (settlement.amountCents / 100).toFixed(2);
  const isPayer = settlement.fromUserId === currentUserId;
  const isPayee = settlement.toUserId === currentUserId;

  const handlesByProvider: Record<PayProvider, string | null> = {
    venmo: settlement.toVenmoHandle,
    paypal: settlement.toPaypalHandle,
    cashapp: settlement.toCashappHandle,
  };

  function pay(provider: PayProvider) {
    const providerHandle = handlesByProvider[provider];
    if (!providerHandle) return;
    const url = buildPayLink(provider, {
      handle: providerHandle,
      amountCents: settlement.amountCents,
      note: `Reckon settle-up`,
    });
    window.open(url, "_blank");
  }

  async function onMarkPaid() {
    setPending(true);
    await markPaid(settlement.id);
    router.refresh();
  }

  async function onConfirmReceived() {
    setPending(true);
    await confirmReceived(settlement.id);
    router.refresh();
  }

  const hasAnyPaymentMethod =
    settlement.toVenmoHandle ||
    settlement.toPaypalHandle ||
    settlement.toCashappHandle ||
    settlement.toEasypaisaNumber ||
    settlement.toJazzcashNumber ||
    settlement.toNayapayHandle ||
    settlement.toBankDetails;

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
      {settlement.status === "CONFIRMED" ? (
        <p className="mt-2 text-sm text-muted-foreground">✓ Settled</p>
      ) : (
        <>
          {isPayer && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {settlement.toVenmoHandle && (
                  <Button size="sm" onClick={() => pay("venmo")}>Venmo</Button>
                )}
                {settlement.toPaypalHandle && (
                  <Button size="sm" onClick={() => pay("paypal")}>PayPal</Button>
                )}
                {settlement.toCashappHandle && (
                  <Button size="sm" onClick={() => pay("cashapp")}>Cash App</Button>
                )}
              </div>
              {settlement.toEasypaisaNumber && (
                <CopyRow label="EasyPaisa" value={settlement.toEasypaisaNumber} />
              )}
              {settlement.toJazzcashNumber && (
                <CopyRow label="JazzCash" value={settlement.toJazzcashNumber} />
              )}
              {settlement.toNayapayHandle && (
                <CopyRow label="NayaPay" value={settlement.toNayapayHandle} />
              )}
              {settlement.toBankDetails && (
                <CopyRow label="Bank transfer" value={settlement.toBankDetails} />
              )}
              {!hasAnyPaymentMethod && (
                <p className="text-xs text-muted-foreground">
                  {settlement.toName} hasn&apos;t added a payment method yet.
                </p>
              )}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            {isPayer && settlement.status === "PENDING" && (
              <Button size="sm" variant="outline" disabled={pending} onClick={onMarkPaid}>
                Mark as paid
              </Button>
            )}
            {isPayee && settlement.status === "PAY_MARKED" && (
              <Button size="sm" variant="outline" disabled={pending} onClick={onConfirmReceived}>
                Confirm received
              </Button>
            )}
            {settlement.status === "PAY_MARKED" && !isPayee && (
              <p className="text-xs text-muted-foreground">Waiting for confirmation…</p>
            )}
          </div>
        </>
      )}
    </li>
  );
}
