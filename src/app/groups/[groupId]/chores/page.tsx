import { listChores, getChoreFairness } from "@/lib/actions/chores";
import { computeFairnessBars } from "@/lib/chore-fairness";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
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
  const [session, chores, fairness] = await Promise.all([
    requireSession(),
    listChores(groupId),
    getChoreFairness(groupId),
  ]);
  const dict = await getDictionary(session.locale);
  const bars = computeFairnessBars(fairness);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{dict.chores.title}</h1>
      <HelpTip text={dict.chores.helpTip} />
      <AddChoreForm groupId={groupId} dict={dict} />
      <FairnessBars bars={bars} title={dict.chores.fairnessTitle} />
      <ChoreList groupId={groupId} chores={chores} dict={dict} />
    </div>
  );
}
