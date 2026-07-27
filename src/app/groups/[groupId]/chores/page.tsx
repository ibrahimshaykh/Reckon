import { listChores, getChoreFairness } from "@/lib/actions/chores";
import { computeFairnessBars } from "@/lib/chore-fairness";
import { AddChoreForm } from "@/components/chores/add-chore-form";
import { ChoreList } from "@/components/chores/chore-list";
import { FairnessBars } from "@/components/chores/fairness-bars";
import { HelpTip } from "@/components/help-tip";

export default async function ChoresPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [chores, fairness] = await Promise.all([
    listChores(groupId),
    getChoreFairness(groupId),
  ]);
  const bars = computeFairnessBars(fairness);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Chores</h1>
      <HelpTip text="Rotate now assigns any chore whose current period has ended, weighting by effort so nobody keeps the worst jobs." />
      <AddChoreForm groupId={groupId} />
      <FairnessBars bars={bars} />
      <ChoreList groupId={groupId} chores={chores} />
    </div>
  );
}
