import { listChores } from "@/lib/actions/chores";
import { AddChoreForm } from "@/components/chores/add-chore-form";
import { ChoreList } from "@/components/chores/chore-list";

export default async function ChoresPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const chores = await listChores(groupId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Chores</h1>
      <AddChoreForm groupId={groupId} />
      <ChoreList groupId={groupId} chores={chores} />
    </div>
  );
}
