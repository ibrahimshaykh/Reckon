import { notFound } from "next/navigation";
import { getGuestSession } from "@/lib/dal";
import { db } from "@/lib/db";
import { buildPayLink } from "@/lib/pay-links";
import { toCents } from "@/lib/money";
import { CopyRow } from "@/components/copy-row";

export default async function GuestExpensePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const guestToken = await getGuestSession(token);
  if (!guestToken) notFound();

  const expense = await db.expense.findUniqueOrThrow({
    where: { id: guestToken.expenseId },
    include: {
      paidBy: true,
      items: { include: { participants: { include: { user: true } } } },
    },
  });

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
        Hi {guestToken.guestName} — {expense.paidBy.displayName} paid $
        {Number(expense.totalAmount).toFixed(2)} for this.
      </p>
      <ul className="flex flex-col gap-1">
        {expense.items.flatMap((item) =>
          item.participants.map((p) => (
            <li key={p.id} className="text-sm">
              {p.user.displayName}: $
              {((toCents(item.amount) * Number(p.shareRatio)) / 100).toFixed(2)}
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
            Pay {payer.displayName} on Venmo
          </a>
        )}
        {payer.easypaisaNumber && <CopyRow label="EasyPaisa" value={payer.easypaisaNumber} />}
        {payer.jazzcashNumber && <CopyRow label="JazzCash" value={payer.jazzcashNumber} />}
        {payer.nayapayHandle && <CopyRow label="NayaPay" value={payer.nayapayHandle} />}
        {payer.bankDetails && <CopyRow label="Bank transfer" value={payer.bankDetails} />}
        {!hasAnyPaymentMethod && (
          <p className="text-sm text-muted-foreground">
            {payer.displayName} hasn&apos;t added a payment method yet.
          </p>
        )}
      </div>
    </div>
  );
}
