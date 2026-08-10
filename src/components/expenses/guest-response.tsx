"use client";

import { useState } from "react";
import { respondAsGuest, markGuestSent } from "@/lib/actions/guest";
import { isActionError } from "@/lib/action-result";
import { buildPayLink } from "@/lib/pay-links";
import { interpolate } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { CopyRow } from "@/components/copy-row";
import type { GuestPayTo, GuestView } from "@/lib/actions/guest";
import type { Dictionary } from "@/lib/dictionary";

// One person's ways of being paid. Shared between "pay whoever fronted the
// bill" and "pay the hosts who covered you", since those differ only in who
// the money is going to.
function PayMethods({
  details,
  name,
  amountCents,
  note,
  dict,
}: {
  details: GuestPayTo;
  name: string;
  amountCents: number;
  note: string;
  dict: Dictionary;
}) {
  const hasAny =
    details.venmoHandle ||
    details.paypalHandle ||
    details.cashappHandle ||
    details.easypaisaNumber ||
    details.jazzcashNumber ||
    details.nayapayHandle ||
    details.bankDetails;

  // Every tap-through method the payer has saved. Listing only some of them
  // told a guest "no payment method" while the payer was looking at one they
  // had filled in.
  const links = [
    { provider: "venmo" as const, handle: details.venmoHandle, label: dict.guest.payOnVenmo },
    { provider: "paypal" as const, handle: details.paypalHandle, label: dict.guest.payOnPaypal },
    { provider: "cashapp" as const, handle: details.cashappHandle, label: dict.guest.payOnCashapp },
  ];

  return (
    <div className="flex flex-col gap-2">
      {links.map(
        ({ provider, handle, label }) =>
          handle && (
            <a
              key={provider}
              href={buildPayLink(provider, {
                handle,
                // Their own share — the old page pre-filled Venmo with the
                // entire expense total, so a guest who tapped through paid for
                // everyone.
                amountCents,
                note,
              })}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline"
            >
              {interpolate(label, { name })}
            </a>
          ),
      )}
      {details.easypaisaNumber && (
        <CopyRow label={dict.common.easypaisa} value={details.easypaisaNumber} dict={dict} />
      )}
      {details.jazzcashNumber && (
        <CopyRow label={dict.common.jazzcash} value={details.jazzcashNumber} dict={dict} />
      )}
      {details.nayapayHandle && (
        <CopyRow label={dict.common.nayapay} value={details.nayapayHandle} dict={dict} />
      )}
      {details.bankDetails && (
        <CopyRow label={dict.common.bankTransfer} value={details.bankDetails} dict={dict} />
      )}
      {!hasAny && (
        <p className="text-sm text-muted-foreground">
          {interpolate(dict.common.noPaymentMethod, { name })}
        </p>
      )}
    </div>
  );
}

// The guest's side of an expense. A guest can only say "I'll pay" or
// "ignore" — marking the money as actually received is the payer's call,
// since they're the one who'd know.
export function GuestResponse({
  token,
  status,
  payerName,
  amount,
  shareCents,
  expenseTitle,
  payTo,
  covered,
  hosts,
  currency,
  paidAmountCents,
  paidAt,
  dict,
}: {
  token: string;
  status: GuestView["status"];
  payerName: string;
  /** Pre-formatted for display. */
  amount: string;
  /** The same figure in cents, for building payment deep links. */
  shareCents: number;
  expenseTitle: string;
  payTo: GuestView["payTo"];
  covered: boolean;
  hosts: GuestView["hosts"];
  currency: string;
  /** The frozen receipt, present only once the payer has confirmed. */
  paidAmountCents: number | null;
  paidAt: string | null;
  dict: Dictionary;
}) {
  const [current, setCurrent] = useState(status);
  const [currentPayTo, setCurrentPayTo] = useState(payTo);
  const [pending, setPending] = useState<"PAYING" | "DECLINED" | "SENT" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function respond(choice: "PAYING" | "DECLINED") {
    setPending(choice);
    setError(null);

    const result = await respondAsGuest({ token, choice });

    if (isActionError(result)) {
      setError(result.error);
      setPending(null);
      return;
    }

    setCurrent(result.status);
    setCurrentPayTo(result.payTo);
    setPending(null);
  }

  async function sent() {
    setPending("SENT");
    setError(null);

    const result = await markGuestSent(token);

    if (isActionError(result)) {
      setError(result.error);
      setPending(null);
      return;
    }

    setCurrent(result.status);
    setPending(null);
  }

  // Settled. The link is finished as a way to pay — no methods, no buttons —
  // but it is kept readable as a receipt rather than turned into a dead page,
  // because the one person who most wants proof this happened is the person
  // holding this link.
  if (current === "PAID") {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-rule bg-card p-4">
        <p>
          <span className="stamp text-positive">{dict.guest.paidHeading}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {interpolate(dict.guest.paidNote, {
            payerName,
            amount: paidAmountCents !== null
              ? formatMoney(paidAmountCents, currency)
              : amount,
          })}
        </p>
        {paidAt && (
          <p className="tabular text-xs text-muted-foreground" suppressHydrationWarning>
            {new Date(paidAt).toLocaleString()}
          </p>
        )}
      </section>
    );
  }

  // They say the money has gone. The books haven't moved — only the payer
  // confirming does that — so this says what is actually true: it is with
  // them now, and somebody else has to look.
  //
  // Checked before `covered` on purpose. Somebody who has already sent money
  // must never be told there is nothing to pay; that reads as "you sent that
  // for no reason", which is alarming and, since the payer still has to
  // confirm it, not even true.
  if (current === "SENT") {
    return (
      <section className="flex flex-col gap-1 rounded-lg border border-rule bg-card p-4">
        <p className="text-sm font-medium">
          <span className="stamp text-positive">{dict.guest.sentStamp}</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {interpolate(dict.guest.sentNote, { payerName, amount })}
        </p>
      </section>
    );
  }

  // The hosts have already squared up, so this guest owes nobody. Being
  // someone's guest means you aren't chased for the bill — but it stays
  // their choice, so there's a quiet way to insist rather than a locked door.
  //
  // Only shown to somebody who has not already volunteered. Telling a person
  // who said "I'll pay" that there is nothing to pay reads as the app
  // forgetting, and throws away the one thing they had decided.
  if (covered && current !== "PAYING") {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-rule bg-card p-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{dict.guest.coveredHeading}</p>
          <p className="text-sm text-muted-foreground">
            {interpolate(dict.guest.coveredNote, {
              hosts: hosts.map((h) => h.name).join(` ${dict.common.and} `),
            })}
          </p>
        </div>
        {/* Insisting is just saying they'll pay, so it goes through the same
            door as everybody else and lands on the same screen. It used to
            open a parallel one that asked them to pay each host separately —
            which nobody could confirm and the books could not record. */}
        <Button
          variant="outline"
          size="sm"
          disabled={pending !== null}
          onClick={() => respond("PAYING")}
        >
          {dict.guest.insistLink}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>
    );
  }

  if (current === "DECLINED") {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-rule bg-card p-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{dict.guest.declinedHeading}</p>
          <p className="text-sm text-muted-foreground">
            {interpolate(dict.guest.declinedNote, { payerName })}
          </p>
        </div>
        {/* Declining isn't final — people change their minds, and the
            alternative is a dead link they can't undo. */}
        <Button
          variant="outline"
          size="sm"
          disabled={pending !== null}
          onClick={() => respond("PAYING")}
        >
          {dict.guest.changeMind}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>
    );
  }

  if (current === "PAYING" && currentPayTo) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-rule bg-card p-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">
            {covered
              ? dict.guest.stillPayingHeading
              : interpolate(dict.guest.payingHeading, { amount, payerName })}
          </p>
          {/* One recipient, always: whoever fronted the bill. Splitting the
              payment across the hosts looked fairer and was unworkable —
              nobody but the bill payer could confirm it arrived, and the
              books record a guest's payment as having reached the person who
              paid. The group redistributing it afterwards is what Who owes
              who already does. */}
          <p className="text-sm text-muted-foreground">
            {covered
              ? interpolate(dict.guest.stillPayingNote, {
                  hosts: hosts.map((h) => h.name).join(` ${dict.common.and} `),
                  payerName,
                })
              : dict.guest.payingNote}
          </p>
        </div>
        <PayMethods
          details={currentPayTo}
          name={payerName}
          amountCents={shareCents}
          note={expenseTitle}
          dict={dict}
        />
        {/* The step that was missing. Without it the payer could not tell
            somebody who meant to pay from somebody who already had, and the
            guest had no way to say "it's done, go and look". */}
        <div className="flex flex-col gap-1.5 border-t border-rule pt-3">
          <Button size="sm" disabled={pending !== null} onClick={sent}>
            {dict.guest.iveSentIt}
          </Button>
          <p className="text-xs text-muted-foreground">{dict.guest.iveSentNote}</p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          className="flex-1"
          disabled={pending !== null}
          onClick={() => respond("PAYING")}
        >
          {dict.guest.illPay}
        </Button>
        <Button
          className="flex-1"
          variant="outline"
          disabled={pending !== null}
          onClick={() => respond("DECLINED")}
        >
          {dict.guest.ignoreIt}
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {dict.guest.decidingNote}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
