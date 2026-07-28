"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markPaid, confirmReceived } from "@/lib/actions/settlements";
import { createSafepayCheckout } from "@/lib/actions/safepay-checkout";
import { isActionError } from "@/lib/action-result";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { CopyRow } from "@/components/copy-row";
import { buildPayLink, type PayProvider } from "@/lib/pay-links";
import type { Dictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
import { Reveal } from "@/components/motion/reveal";
import { AnimatePresence, motion } from "motion/react";

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
    return (
      <div className="ledger-panel rounded-r-lg px-5 py-8 text-center">
        <p className="text-sm text-ledger-foreground">{dict.settle.settledUp}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {settlements.map((s, i) => (
        <Reveal key={s.id} delay={i * 0.06}>
          <SettlementRow
            settlement={s}
            currentUserId={currentUserId}
            currency={currency}
            dict={dict}
          />
        </Reveal>
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
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    const result = await markPaid(settlement.id);
    if (isActionError(result)) {
      setError(result.error);
      setPending(false);
    } else {
      router.refresh();
    }
  }

  async function onConfirmReceived() {
    setPending(true);
    setError(null);
    const result = await confirmReceived(settlement.id);
    if (isActionError(result)) {
      setError(result.error);
      setPending(false);
    } else {
      router.refresh();
    }
  }

  async function onPayBySafepay() {
    setPending(true);
    setError(null);
    const result = await createSafepayCheckout(settlement.id);
    if (isActionError(result)) {
      setError(result.error);
      setPending(false);
      return;
    }
    if ("unavailable" in result) {
      setSafepayUnavailable(true);
      setPending(false);
      return;
    }
    window.location.href = result.url;
  }

  const canAct =
    (isPayer && settlement.status === "PENDING") ||
    (isPayee && settlement.status === "PAY_MARKED") ||
    (settlement.status === "PAY_MARKED" && !isPayee);

  const hasAnyPaymentMethod =
    settlement.toVenmoHandle ||
    settlement.toPaypalHandle ||
    settlement.toCashappHandle ||
    settlement.toEasypaisaNumber ||
    settlement.toJazzcashNumber ||
    settlement.toNayapayHandle ||
    settlement.toBankDetails;

  return (
    <li className="ledger-panel overflow-hidden rounded-r-lg transition-colors hover:bg-accent/40">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-sm leading-snug text-foreground">
            {interpolate(dict.settle.owesPair, {
              fromName: settlement.fromName,
              toName: settlement.toName,
            })}
          </p>
          <button
            type="button"
            onClick={() => setShowMath((v) => !v)}
            className="w-fit font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            {showMath ? dict.common.hideMath : dict.common.showMath}
          </button>
        </div>
        <p className="tabular shrink-0 text-2xl font-semibold leading-none text-foreground sm:text-right">
          {amount}
        </p>
      </div>
      <AnimatePresence initial={false}>
        {showMath && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <ul className="flex flex-col gap-1.5 border-t border-rule px-4 py-3">
              {settlement.explanation.steps.map((step, i) => (
                <li key={i} className="ledger-step tabular text-xs leading-relaxed">
                  {step}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
      {settlement.status === "CONFIRMED" ? (
        <p className="border-t border-rule px-4 py-3 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-positive">
          {dict.settle.settledBadge}
        </p>
      ) : (isPayer || canAct) && (
        <div className="flex flex-col gap-3 border-t border-rule px-4 py-3">
          {isPayer && (
            <div className="flex flex-col gap-2">
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
          {canAct && (
          <div className="flex flex-wrap items-center gap-2">
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
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">
                {dict.settle.waitingConfirmation}
              </p>
            )}
          </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </li>
  );
}
