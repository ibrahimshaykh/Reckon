import { listProposals } from "@/lib/actions/proposals";
import { getGroup } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
import { AddProposalForm } from "@/components/proposals/add-proposal-form";
import { ProposalList } from "@/components/proposals/proposal-list";
import { MeetingPointMap } from "@/components/proposals/meeting-point-map-wrapper";
import { HelpTip } from "@/components/help-tip";

export default async function ProposalsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [{ proposals, memberHomes }, group, session] = await Promise.all([
    listProposals(groupId),
    getGroup(groupId),
    requireSession(),
  ]);
  const dict = await getDictionary(session.locale);

  const locatedProposals = proposals.filter(
    (p): p is typeof p & { latitude: number; longitude: number } =>
      p.latitude !== null && p.longitude !== null,
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{dict.proposals.title}</h1>
      <HelpTip text={dict.proposals.helpTip} />
      <AddProposalForm groupId={groupId} dict={dict} />
      {memberHomes.length > 0 && (
        <MeetingPointMap homes={memberHomes} proposals={locatedProposals} dict={dict} />
      )}
      <ProposalList proposals={proposals} currency={group.currency} dict={dict} />
    </div>
  );
}
