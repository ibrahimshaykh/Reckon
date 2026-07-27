import { listProposals } from "@/lib/actions/proposals";
import { getGroup } from "@/lib/actions/groups";
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
  const [{ proposals, memberHomes }, group] = await Promise.all([
    listProposals(groupId),
    getGroup(groupId),
  ]);

  const locatedProposals = proposals.filter(
    (p): p is typeof p & { latitude: number; longitude: number } =>
      p.latitude !== null && p.longitude !== null,
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Proposals</h1>
      <HelpTip text="Flags come from each person's own budget and dietary settings — nothing is picked for the group." />
      <AddProposalForm groupId={groupId} />
      {memberHomes.length > 0 && (
        <MeetingPointMap homes={memberHomes} proposals={locatedProposals} />
      )}
      <ProposalList proposals={proposals} currency={group.currency} />
    </div>
  );
}
