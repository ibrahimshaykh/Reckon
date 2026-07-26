import Link from "next/link";
import { getGroup } from "@/lib/actions/groups";
import { listGroupExpenses } from "@/lib/actions/expenses";
import { AddMemberForm } from "@/components/groups/add-member-form";
import { Button } from "@/components/ui/button";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [group, expenses] = await Promise.all([
    getGroup(groupId),
    listGroupExpenses(groupId),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{group.name}</h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Members</h2>
        <ul className="flex flex-col gap-1">
          {group.members.map((m) => (
            <li key={m.id} className="text-sm">
              {m.displayName} ({m.email})
            </li>
          ))}
        </ul>
        <AddMemberForm groupId={group.id} />
      </section>
      <nav className="flex gap-2">
        <Button
          render={<Link href={`/groups/${group.id}/chores`} />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          Chores
        </Button>
        <Button
          render={<Link href={`/groups/${group.id}/availability`} />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          Availability
        </Button>
        <Button
          render={<Link href={`/groups/${group.id}/ious`} />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          IOUs
        </Button>
        <Button
          render={<Link href={`/groups/${group.id}/proposals`} />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          Proposals
        </Button>
        <Button
          render={<Link href={`/groups/${group.id}/ask`} />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          Ask AI
        </Button>
      </nav>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Expenses</h2>
          <div className="flex gap-2">
            <Button
              render={<Link href={`/groups/${group.id}/expenses/new`} />}
              nativeButton={false}
              size="sm"
            >
              Add expense
            </Button>
            <Button
              render={<Link href={`/groups/${group.id}/settle`} />}
              nativeButton={false}
              variant="outline"
              size="sm"
            >
              Who owes who
            </Button>
          </div>
        </div>
        {expenses.length === 0 && (
          <p className="text-sm text-muted-foreground">No expenses yet.</p>
        )}
        <ul className="flex flex-col gap-1">
          {expenses.map((e) => (
            <li key={e.id} className="rounded-lg border p-3 text-sm">
              <strong>{e.title}</strong> — ${e.totalAmount.toFixed(2)}, paid by{" "}
              {e.paidByName}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
