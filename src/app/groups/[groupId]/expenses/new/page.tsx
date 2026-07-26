import { getGroup } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { AddExpenseForm } from "@/components/expenses/add-expense-form";

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

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Add expense to {group.name}</h1>
      <AddExpenseForm
        groupId={group.id}
        members={group.members}
        currentUserId={session.id}
      />
    </div>
  );
}
