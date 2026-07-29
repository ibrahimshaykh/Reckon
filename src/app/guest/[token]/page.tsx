import { notFound } from "next/navigation";
import { getGuestView } from "@/lib/actions/guest";
import { formatMoney } from "@/lib/money";
import { getDictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
import { GuestResponse } from "@/components/expenses/guest-response";

// What someone without an account sees. Deliberately shows one number —
// their own share — and never the group's split. The old version listed
// every member and what each of them owed, which handed a stranger with a
// link the group's whole private ledger, and then quoted them the entire
// bill as if it were theirs to pay.
export default async function GuestExpensePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await getGuestView(token);
  if (!view) notFound();

  const dict = await getDictionary("en");
  const amount = formatMoney(view.shareCents, view.currency);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 px-6 py-14">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">{view.expenseTitle}</h1>
        <p className="text-sm text-muted-foreground">
          {interpolate(dict.guest.greeting, {
            guestName: view.guestName,
            payerName: view.payerName,
            title: view.expenseTitle,
          })}
        </p>
      </header>

      <div className="flex flex-col items-center gap-1 rounded-lg border border-rule bg-card px-6 py-8">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {dict.guest.yourShare}
        </span>
        <span className="tabular text-3xl font-semibold">{amount}</span>
        <span className="mt-1 text-center text-xs text-muted-foreground">
          {dict.guest.shareExplainer}
        </span>
      </div>

      <GuestResponse
        token={token}
        status={view.status}
        payerName={view.payerName}
        amount={amount}
        shareCents={view.shareCents}
        expenseTitle={view.expenseTitle}
        payTo={view.payTo}
        covered={view.covered}
        hosts={view.hosts}
        currency={view.currency}
        dict={dict}
      />
    </div>
  );
}
