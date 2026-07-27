import { getGroup } from "@/lib/actions/groups";
import { getGroupFreeTime } from "@/lib/actions/availability";
import { requireSession } from "@/lib/dal";
import { formatDateParam, getWeekDays, parseDateParam } from "@/lib/availability-grid";
import { WeekGrid } from "@/components/availability/week-grid";
import { FreeTimeList } from "@/components/availability/free-time-list";
import { HelpTip } from "@/components/help-tip";

export default async function AvailabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const { groupId } = await params;
  const { start } = await searchParams;
  const startDate = formatDateParam(getWeekDays(parseDateParam(start, new Date()))[0]);

  const [session, group, freeTime] = await Promise.all([
    requireSession(),
    getGroup(groupId),
    getGroupFreeTime(groupId),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Group availability</h1>
      <HelpTip text="Drag across the grid to mark yourself free. Where everyone's colors overlap, it glows brightest — that's when to plan something." />
      <WeekGrid
        groupId={groupId}
        startDate={startDate}
        members={group.members}
        entries={freeTime.entries}
        currentUserId={session.id}
      />
      <FreeTimeList respondedCount={freeTime.respondedCount} windows={freeTime.windows} />
    </div>
  );
}
