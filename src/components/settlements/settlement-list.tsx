"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markPaid, confirmReceived } from "@/lib/actions/settlements";
import { createSafepayCheckout } from "@/lib/actions/safepay-checkout";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { CopyRow } from "@/components/copy-row";
import { buildPayLink, type PayProvider } from "@/lib/pay-links";
import type { Dictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";

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
  currency,
  dict,
}: {
  settlements: Settlement[];
  currentUserId: string;
  currency: string;
  dict: Dictionary;
}) {
  if (settlements.length === 0) {
    return <p className="text-sm text-muted-foreground">{dict.settle.settledUp}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {settlements.map((s) => (
        <SettlementRow
          key={s.id}
          settlement={s}
          currentUserId={currentUserId}
          currency={currency}
          dict={dict}
        />
      ))}
    </ul>
  );
}

function SettlementRow({
  settlement,
  currentUserId,
  currency,
  dict,
}: {
  settlement: Settlement;
  currentUserId: string;
  currency: string;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [showMath, setShowMath] = useState(false);
  const [pending, setPending] = useState(false);
  const [safepayUnavailable, setSafepayUnavailable] = useState(false);

  const amount = formatMoney(settlement.amountCents, currency);
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
      note: dict.settle.payNote,
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

  async function onPayBySafepay() {
    setPending(true);
    const result = await createSafepayCheckout(settlement.id);
    if ("unavailable" in result) {
      setSafepayUnavailable(true);
      setPending(false);
      return;
    }
    window.location.href = result.url;
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
          {interpolate(dict.settle.owesLine, {
            fromName: settlement.fromName,
            toName: settlement.toName,
            amount,
          })}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setShowMath((v) => !v)}>
          {showMath ? dict.common.hideMath : dict.common.showMath}
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
        <p className="mt-2 text-sm text-muted-foreground">{dict.settle.settledBadge}</p>
      ) : (
        <>
          {isPayer && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {settlement.toVenmoHandle && (
                  <Button size="sm" onClick={() => pay("venmo")}>{dict.settle.venmoButton}</Button>
                )}
                {settlement.toPaypalHandle && (
                  <Button size="sm" onClick={() => pay("paypal")}>{dict.settle.paypalButton}</Button>
                )}
                {settlement.toCashappHandle && (
                  <Button size="sm" onClick={() => pay("cashapp")}>{dict.settle.cashappButton}</Button>
                )}
              </div>
              {settlement.toEasypaisaNumber && (
                <CopyRow label={dict.common.easypaisa} value={settlement.toEasypaisaNumber} dict={dict} />
              )}
              {settlement.toJazzcashNumber && (
                <CopyRow label={dict.common.jazzcash} value={settlement.toJazzcashNumber} dict={dict} />
              )}
              {settlement.toNayapayHandle && (
                <CopyRow label={dict.common.nayapay} value={settlement.toNayapayHandle} dict={dict} />
              )}
              {settlement.toBankDetails && (
                <CopyRow label={dict.common.bankTransfer} value={settlement.toBankDetails} dict={dict} />
              )}
              {!hasAnyPaymentMethod && (
                <p className="text-xs text-muted-foreground">
                  {interpolate(dict.common.noPaymentMethod, { name: settlement.toName })}
                </p>
              )}
              {!safepayUnavailable && (
                <Button size="sm" variant="outline" disabled={pending} onClick={onPayBySafepay}>
                  {dict.settle.payByCard}
                </Button>
              )}
              {safepayUnavailable && (
                <p className="text-xs text-muted-foreground">
                  {dict.settle.cardNotSetUp}
                </p>
              )}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            {isPayer && settlement.status === "PENDING" && (
              <Button size="sm" variant="outline" disabled={pending} onClick={onMarkPaid}>
                {dict.settle.markAsPaid}
              </Button>
            )}
            {isPayee && settlement.status === "PAY_MARKED" && (
              <Button size="sm" variant="outline" disabled={pending} onClick={onConfirmReceived}>
                {dict.settle.confirmReceived}
              </Button>
            )}
            {settlement.status === "PAY_MARKED" && !isPayee && (
              <p className="text-xs text-muted-foreground">{dict.settle.waitingConfirmation}</p>
            )}
          </div>
        </>
      )}
    </li>
  );
}
