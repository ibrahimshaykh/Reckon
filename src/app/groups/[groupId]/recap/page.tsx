import { listPastRecaps } from "@/lib/actions/recap";
import { RecapView } from "@/components/recap/recap-view";
import { PastRecaps } from "@/components/recap/past-recaps";
import { HelpTip } from "@/components/help-tip";

export default async function RecapPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const pastRecaps = await listPastRecaps(groupId);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Monthly recap</h1>
      <HelpTip text="A short AI summary of this month's real spending and chore activity — nothing invented. Only generates once per month; revisiting shows the same saved recap." />
      <RecapView groupId={groupId} />
      <PastRecaps recaps={pastRecaps} />
    </div>
  );
}
