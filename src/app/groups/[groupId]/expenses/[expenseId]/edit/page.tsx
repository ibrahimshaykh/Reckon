import { notFound } from "next/navigation";
import { getGroup } from "@/lib/actions/groups";
import { getExpenseForEdit } from "@/lib/actions/expenses";
import { isActionError } from "@/lib/action-result";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
import { PageHeader } from "@/components/page-header";
import { EditExpenseForm } from "@/components/expenses/edit-expense-form";

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ groupId: string; expenseId: string }>;
}) {
  const { groupId, expenseId } = await params;
  const [group, session, expense] = await Promise.all([
    getGroup(groupId),
    requireSession(),
    getExpenseForEdit(expenseId),
  ]);
  const dict = await getDictionary(session.locale);

  // Not the payer, or no such expense — same 404 either way, so a stranger
  // can't tell "exists but isn't yours" from "doesn't exist".
  if (isActionError(expense) || expense.groupId !== groupId) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 md:py-14">
      <PageHeader eyebrow={group.name} title={dict.expenses.editTitle} />
      <EditExpenseForm
        expense={expense}
        members={group.members}
        currency={group.currency}
        dict={dict}
      />
    </div>
  );
}
