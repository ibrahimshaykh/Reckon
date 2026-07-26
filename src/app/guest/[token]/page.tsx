import { notFound } from "next/navigation";
import { getGuestSession } from "@/lib/dal";
import { db } from "@/lib/db";
import { buildPayLink } from "@/lib/pay-links";
import { toCents } from "@/lib/money";

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
      <a
        href={buildPayLink("venmo", {
          handle: expense.paidBy.displayName,
          amountCents: toCents(expense.totalAmount),
          note: expense.title,
        })}
        className="text-sm text-primary underline"
      >
        Pay {expense.paidBy.displayName} on Venmo
      </a>
    </div>
  );
}
