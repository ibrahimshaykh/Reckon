import { listPastRecaps } from "@/lib/actions/recap";
import { getGroup } from "@/lib/actions/groups";
import { RecapView } from "@/components/recap/recap-view";
import { PastRecaps } from "@/components/recap/past-recaps";
import { HelpTip } from "@/components/help-tip";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";

export default async function RecapPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [session, pastRecaps, group] = await Promise.all([
    requireSession(),
    listPastRecaps(groupId),
    getGroup(groupId),
  ]);
  const dict = await getDictionary(session.locale);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">{dict.recap.title}</h1>
      <HelpTip text={dict.recap.helpTip} />
      <RecapView groupId={groupId} currency={group.currency} dict={dict} />
      <PastRecaps recaps={pastRecaps} currency={group.currency} dict={dict} />
    </div>
  );
}
