import { notFound } from "next/navigation";
import { getGuestSession } from "@/lib/dal";
import { db } from "@/lib/db";
import { buildPayLink } from "@/lib/pay-links";
import { toCents, formatMoney } from "@/lib/money";
import { getDictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
import { CopyRow } from "@/components/copy-row";

export default async function GuestExpensePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const guestToken = await getGuestSession(token);
  if (!guestToken) notFound();

  const dict = await getDictionary("en");
  const expense = await db.expense.findUniqueOrThrow({
    where: { id: guestToken.expenseId },
    include: {
      paidBy: true,
      group: true,
      items: { include: { participants: { include: { user: true } } } },
    },
  });
  const currency = expense.group.currency;

  const payer = expense.paidBy;
  const hasAnyPaymentMethod =
    payer.venmoHandle ||
    payer.easypaisaNumber ||
    payer.jazzcashNumber ||
    payer.nayapayHandle ||
    payer.bankDetails;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">{expense.title}</h1>
      <p className="text-sm text-muted-foreground">
        {interpolate(dict.guest.greeting, {
          guestName: guestToken.guestName,
          payerName: expense.paidBy.displayName,
          amount: formatMoney(toCents(expense.totalAmount), currency),
        })}
      </p>
      <ul className="flex flex-col gap-1">
        {expense.items.flatMap((item) =>
          item.participants.map((p) => (
            <li key={p.id} className="text-sm">
              {p.user.displayName}:{" "}
              {formatMoney(Math.round(toCents(item.amount) * Number(p.shareRatio)), currency)}
            </li>
          )),
        )}
      </ul>
      <div className="flex flex-col gap-2">
        {payer.venmoHandle && (
          <a
            href={buildPayLink("venmo", {
              handle: payer.venmoHandle,
              amountCents: toCents(expense.totalAmount),
              note: expense.title,
            })}
            className="text-sm text-primary underline"
          >
            {interpolate(dict.guest.payOnVenmo, { name: payer.displayName })}
          </a>
        )}
        {payer.easypaisaNumber && (
          <CopyRow label={dict.common.easypaisa} value={payer.easypaisaNumber} dict={dict} />
        )}
        {payer.jazzcashNumber && (
          <CopyRow label={dict.common.jazzcash} value={payer.jazzcashNumber} dict={dict} />
        )}
        {payer.nayapayHandle && (
          <CopyRow label={dict.common.nayapay} value={payer.nayapayHandle} dict={dict} />
        )}
        {payer.bankDetails && (
          <CopyRow label={dict.common.bankTransfer} value={payer.bankDetails} dict={dict} />
        )}
        {!hasAnyPaymentMethod && (
          <p className="text-sm text-muted-foreground">
            {interpolate(dict.common.noPaymentMethod, { name: payer.displayName })}
          </p>
        )}
      </div>
    </div>
  );
}
