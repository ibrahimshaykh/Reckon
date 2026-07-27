import { getGroup } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
import { ExpenseEntryTabs } from "@/components/expenses/expense-entry-tabs";

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [group, session] = await Promise.all([
    getGroup(groupId),
    requireSession(),
  ]);
  const dict = await getDictionary(session.locale);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">
        {interpolate(dict.expenses.addToGroup, { name: group.name })}
      </h1>
      <ExpenseEntryTabs
        groupId={group.id}
        members={group.members}
        currentUserId={session.id}
        currency={group.currency}
        dict={dict}
      />
    </div>
  );
}
