import Link from "next/link";
import { getGroup } from "@/lib/actions/groups";
import { listGroupExpenses } from "@/lib/actions/expenses";
import { formatMoney } from "@/lib/money";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
import { AddMemberForm } from "@/components/groups/add-member-form";
import { ShareExpenseButton } from "@/components/expenses/share-expense-button";
import { CurrencyPicker } from "@/components/groups/currency-picker";
import { Button } from "@/components/ui/button";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [session, group, expenses] = await Promise.all([
    requireSession(),
    getGroup(groupId),
    listGroupExpenses(groupId),
  ]);
  const dict = await getDictionary(session.locale);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{group.name}</h1>
        <CurrencyPicker groupId={group.id} currency={group.currency} dict={dict} />
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{dict.groupHub.members}</h2>
        <ul className="flex flex-col gap-1">
          {group.members.map((m) => (
            <li key={m.id} className="text-sm">
              <Link href={`/friends/${m.id}`} className="hover:underline">
                {m.displayName}
              </Link>{" "}
              ({m.email})
            </li>
          ))}
        </ul>
        <AddMemberForm groupId={group.id} dict={dict} />
      </section>
      <nav className="flex gap-2">
        <Button
          render={<Link href={`/groups/${group.id}/chores`} />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          {dict.groupHub.chores}
        </Button>
        <Button
          render={<Link href={`/groups/${group.id}/availability`} />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          {dict.groupHub.availability}
        </Button>
        <Button
          render={<Link href={`/groups/${group.id}/ious`} />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          {dict.groupHub.ious}
        </Button>
        <Button
          render={<Link href={`/groups/${group.id}/proposals`} />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          {dict.groupHub.proposals}
        </Button>
        <Button
          render={<Link href={`/groups/${group.id}/ask`} />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          {dict.groupHub.askAi}
        </Button>
        <Button
          render={<Link href={`/groups/${group.id}/recap`} />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          {dict.groupHub.monthlyRecap}
        </Button>
      </nav>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">{dict.groupHub.expenses}</h2>
          <div className="flex gap-2">
            <Button
              render={<Link href={`/groups/${group.id}/expenses/new`} />}
              nativeButton={false}
              size="sm"
            >
              {dict.groupHub.addExpense}
            </Button>
            <Button
              render={<Link href={`/groups/${group.id}/settle`} />}
              nativeButton={false}
              variant="outline"
              size="sm"
            >
              {dict.groupHub.whoOwesWho}
            </Button>
          </div>
        </div>
        {expenses.length === 0 && (
          <p className="text-sm text-muted-foreground">{dict.groupHub.noExpensesYet}</p>
        )}
        <ul className="flex flex-col gap-1">
          {expenses.map((e) => (
            <li key={e.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span>
                  <strong>{e.title}</strong>{" "}
                  {interpolate(dict.groupHub.paidByLine, {
                    amount: formatMoney(e.totalAmount * 100, group.currency),
                    name: e.paidByName,
                  })}
                </span>
                <ShareExpenseButton expenseId={e.id} dict={dict} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
