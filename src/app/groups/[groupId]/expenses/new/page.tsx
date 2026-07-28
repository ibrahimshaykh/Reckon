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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 md:py-14">
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
