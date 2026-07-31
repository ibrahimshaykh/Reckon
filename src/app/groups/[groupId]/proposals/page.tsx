import { listProposals } from "@/lib/actions/proposals";
import { getGroup } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
import { AddProposalForm } from "@/components/proposals/add-proposal-form";
import { ProposalList } from "@/components/proposals/proposal-list";
import { MeetingPointMap } from "@/components/proposals/meeting-point-map-wrapper";
import { PageHeader } from "@/components/page-header";
import { FieldGuide } from "@/components/field-guide";

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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 md:py-14">
      <PageHeader
        eyebrow={group.name}
        title={dict.proposals.title}
        description={dict.proposals.helpTip}
      />
      <FieldGuide guide={dict.guides.proposals} dict={dict} />
      <AddProposalForm groupId={groupId} dict={dict} />
      {memberHomes.length > 0 && (
        <MeetingPointMap homes={memberHomes} proposals={locatedProposals} dict={dict} />
      )}
      <ProposalList proposals={proposals} currency={group.currency} dict={dict} />
    </div>
  );
}
