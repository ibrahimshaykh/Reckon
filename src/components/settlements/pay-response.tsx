"use client";

import { useState } from "react";
import { markPaidByToken } from "@/lib/actions/settlements";
import { isActionError } from "@/lib/action-result";
import { buildPayLink } from "@/lib/pay-links";
import { interpolate } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { CopyRow } from "@/components/copy-row";
import type { GuestPayTo } from "@/lib/actions/guest";
import type { Dictionary } from "@/lib/dictionary";

/**
 * A member's side of a debt, reached by link rather than by logging in.
 *
 * Two things are deliberately different from the guest version. There is no
 * way to decline — a member agreed to share the expense when they joined the
 * split, so "not paying" is a conversation to have with the group, not a
 * button. And this writes into the settlement the app already tracks, so the
 * debt has one record: pressing here is the same event as pressing "Mark as
 * paid" in the app, and the payee confirms it in the same place either way.
 */
export function PayResponse({
  token,
  status,
  amountCents,
  amount,
  toName,
  groupName,
  payTo,
  dict,
}: {
  token: string;
  status: string;
  amountCents: number;
  amount: string;
  toName: string;
  groupName: string;
  payTo: GuestPayTo;
  dict: Dictionary;
}) {
  const [current, setCurrent] = useState(status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sent() {
    setPending(true);
    setError(null);

    const result = await markPaidByToken(token);

    if (isActionError(result)) {
      setError(result.error);
      setPending(false);
      return;
    }

    setCurrent("PAY_MARKED");
    setPending(false);
  }

  if (current === "CONFIRMED") {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-rule bg-card p-4">
        <p>
          <span className="stamp text-positive">{dict.pay.settledStamp}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {interpolate(dict.pay.settledNote, { toName, amount })}
        </p>
      </section>
    );
  }

  if (current === "PAY_MARKED") {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-rule bg-card p-4">
        <p>
          <span className="stamp text-positive">{dict.pay.sentStamp}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {interpolate(dict.pay.sentNote, { toName, amount })}
        </p>
      </section>
    );
  }

  const links = [
    { provider: "venmo" as const, handle: payTo.venmoHandle, label: dict.guest.payOnVenmo },
    { provider: "paypal" as const, handle: payTo.paypalHandle, label: dict.guest.payOnPaypal },
    { provider: "cashapp" as const, handle: payTo.cashappHandle, label: dict.guest.payOnCashapp },
  ];

  const hasAny =
    payTo.venmoHandle ||
    payTo.paypalHandle ||
    payTo.cashappHandle ||
    payTo.easypaisaNumber ||
    payTo.jazzcashNumber ||
    payTo.nayapayHandle ||
    payTo.bankDetails;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-rule bg-card p-4">
      <p className="text-sm font-medium">
        {interpolate(dict.pay.sendHeading, { amount, toName })}
      </p>

      <div className="flex flex-col gap-2">
        {links.map(
          ({ provider, handle, label }) =>
            handle && (
              <a
                key={provider}
                href={buildPayLink(provider, {
                  handle,
                  amountCents,
                  note: groupName,
                })}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary underline"
              >
                {interpolate(label, { name: toName })}
              </a>
            ),
        )}
        {payTo.easypaisaNumber && (
          <CopyRow label={dict.common.easypaisa} value={payTo.easypaisaNumber} dict={dict} />
        )}
        {payTo.jazzcashNumber && (
          <CopyRow label={dict.common.jazzcash} value={payTo.jazzcashNumber} dict={dict} />
        )}
        {payTo.nayapayHandle && (
          <CopyRow label={dict.common.nayapay} value={payTo.nayapayHandle} dict={dict} />
        )}
        {payTo.bankDetails && (
          <CopyRow label={dict.common.bankTransfer} value={payTo.bankDetails} dict={dict} />
        )}
        {!hasAny && (
          <p className="text-sm text-muted-foreground">
            {interpolate(dict.common.noPaymentMethod, { name: toName })}
          </p>
        )}
      </div>

      {/* No decline button, unlike the guest link. A member is already in the
          split by agreement; opting out is a conversation with the group, and
          a button here would imply the app can settle it for them. */}
      <div className="flex flex-col gap-1.5 border-t border-rule pt-3">
        <Button disabled={pending} onClick={sent}>
          {dict.pay.iveSentIt}
        </Button>
        <p className="text-xs text-muted-foreground">{dict.pay.iveSentNote}</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
