import { getGroupFreeTime } from "@/lib/actions/availability";
import { AddAvailabilityForm } from "@/components/availability/add-availability-form";
import { FreeTimeList } from "@/components/availability/free-time-list";
import { HelpTip } from "@/components/help-tip";

export default async function AvailabilityPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const freeTime = await getGroupFreeTime(groupId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Group availability</h1>
      <HelpTip text="Only windows everyone who responded has in common show up here — submit yours to join the overlap." />
      <AddAvailabilityForm groupId={groupId} />
      <FreeTimeList respondedCount={freeTime.respondedCount} windows={freeTime.windows} />
    </div>
  );
}
