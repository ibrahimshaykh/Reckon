import { getGroupSettlements } from "@/lib/actions/settlements";
import { getGroup } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
import { SettlementList } from "@/components/settlements/settlement-list";
import { HelpTip } from "@/components/help-tip";

export default async function SettlePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [settlements, session, group] = await Promise.all([
    getGroupSettlements(groupId),
    requireSession(),
    getGroup(groupId),
  ]);
  const dict = await getDictionary(session.locale);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">{dict.settle.title}</h1>
      <HelpTip text={dict.settle.helpTip} />
      <SettlementList
        settlements={settlements}
        currentUserId={session.id}
        currency={group.currency}
        dict={dict}
      />
    </div>
  );
}
