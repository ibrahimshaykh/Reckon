import { RecapView } from "@/components/recap/recap-view";
import { HelpTip } from "@/components/help-tip";

export default async function RecapPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Monthly recap</h1>
      <HelpTip text="A short AI summary of this month's real spending and chore activity — nothing invented." />
      <RecapView groupId={groupId} />
    </div>
  );
}
