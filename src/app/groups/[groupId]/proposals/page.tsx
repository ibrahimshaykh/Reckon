import { listProposals } from "@/lib/actions/proposals";
import { AddProposalForm } from "@/components/proposals/add-proposal-form";
import { ProposalList } from "@/components/proposals/proposal-list";

export default async function ProposalsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const proposals = await listProposals(groupId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Proposals</h1>
      <AddProposalForm groupId={groupId} />
      <ProposalList proposals={proposals} />
    </div>
  );
}
