import { getGroup } from "@/lib/actions/groups";
import { getGroupFreeTime } from "@/lib/actions/availability";
import { requireSession } from "@/lib/dal";
import { formatDateParam, getWeekDays, parseDateParam } from "@/lib/availability-grid";
import { getDictionary } from "@/lib/dictionary";
import { WeekGrid } from "@/components/availability/week-grid";
import { FreeTimeList } from "@/components/availability/free-time-list";
import { PageHeader } from "@/components/page-header";

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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10 md:py-14">
      <PageHeader
        eyebrow={group.name}
        title={dict.availability.title}
        description={dict.availability.helpTip}
      />
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
