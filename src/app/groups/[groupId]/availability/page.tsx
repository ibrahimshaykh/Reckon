import { getGroup } from "@/lib/actions/groups";
import { getGroupFreeTime } from "@/lib/actions/availability";
import { requireSession } from "@/lib/dal";
import { formatDateParam, getWeekDays, parseDateParam } from "@/lib/availability-grid";
import { getDictionary } from "@/lib/dictionary";
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
  const dict = await getDictionary(session.locale);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{dict.availability.title}</h1>
      <HelpTip text={dict.availability.helpTip} />
      <WeekGrid
        groupId={groupId}
        startDate={startDate}
        members={group.members}
        entries={freeTime.entries}
        currentUserId={session.id}
        dict={dict}
      />
      <FreeTimeList
        respondedCount={freeTime.respondedCount}
        windows={freeTime.windows}
        dict={dict}
      />
    </div>
  );
}
