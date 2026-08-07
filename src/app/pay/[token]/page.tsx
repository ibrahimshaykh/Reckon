import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getDictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
import { PayResponse } from "@/components/settlements/pay-response";

/**
 * What the person who owes sees, without needing to log in.
 *
 * The mirror of /confirm/[token], which lets the person owed say the money
 * arrived. Until this existed the app could only reach the creditor: a member
 * who does not open Reckon had no way to find out what they owed or how to
 * send it, and the only remedy was somebody telling them by hand.
 *
 * Deliberately narrow, like the guest link: one debt, one amount, one set of
 * payment details. Whoever holds this link learns nothing about the rest of
 * the group's ledger.
 */
export default async function PayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const settlement = await db.settlement.findUnique({
    where: { payToken: token },
    include: { fromUser: true, toUser: true, group: true },
  });

  if (
    !settlement ||
    !settlement.payTokenExpiresAt ||
    settlement.payTokenExpiresAt < new Date()
  ) {
    notFound();
  }

  const dict = await getDictionary(settlement.fromUser.locale ?? "en");
  const amountCents = Math.round(Number(settlement.amount) * 100);
  const amount = formatMoney(amountCents, settlement.group.currency);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 px-6 py-14">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">{settlement.group.name}</h1>
        <p className="text-sm text-muted-foreground">
          {interpolate(dict.pay.greeting, {
            name: settlement.fromUser.displayName,
            toName: settlement.toUser.displayName,
          })}
        </p>
      </header>

      <div className="flex flex-col items-center gap-1 rounded-lg border border-rule bg-card px-6 py-8">
        <span className="text-xs tracking-wide text-muted-foreground uppercase">
          {dict.pay.youOwe}
        </span>
        <span className="tabular text-3xl font-semibold">{amount}</span>
        <span className="mt-1 text-center text-xs text-muted-foreground">
          {/* Says why this figure and not the bill they remember. It is the
              net of everything between these two people, not one expense. */}
          {dict.pay.explainer}
        </span>
      </div>

      <PayResponse
        token={token}
        status={settlement.status}
        amountCents={amountCents}
        amount={amount}
        toName={settlement.toUser.displayName}
        groupName={settlement.group.name}
        payTo={{
          venmoHandle: settlement.toUser.venmoHandle,
          paypalHandle: settlement.toUser.paypalHandle,
          cashappHandle: settlement.toUser.cashappHandle,
          easypaisaNumber: settlement.toUser.easypaisaNumber,
          jazzcashNumber: settlement.toUser.jazzcashNumber,
          nayapayHandle: settlement.toUser.nayapayHandle,
          bankDetails: settlement.toUser.bankDetails,
        }}
        dict={dict}
      />
    </div>
  );
}
