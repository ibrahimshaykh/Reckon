import { listPastRecaps } from "@/lib/actions/recap";
import { getGroup } from "@/lib/actions/groups";
import { RecapView } from "@/components/recap/recap-view";
import { PastRecaps } from "@/components/recap/past-recaps";
import { PageHeader } from "@/components/page-header";
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 md:py-14">
      <PageHeader
        eyebrow={group.name}
        title={dict.recap.title}
        description={dict.recap.helpTip}
      />
      <RecapView groupId={groupId} currency={group.currency} dict={dict} />
      <PastRecaps recaps={pastRecaps} currency={group.currency} dict={dict} />
    </div>
  );
}
