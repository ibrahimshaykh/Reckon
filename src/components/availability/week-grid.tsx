"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addAvailability, removeAvailability } from "@/lib/actions/availability";
import { getWeekDays, splitEntryByDay, computeHourRange, assignColors } from "@/lib/availability-grid";
import { Button } from "@/components/ui/button";

type Member = { id: string; displayName: string };
type Entry = { id: string; userId: string; startsAt: string; endsAt: string; label: string | null };

const HOUR_PX = 48;

export function WeekGrid({
  groupId,
  weekOffset,
  members,
  entries,
  currentUserId,
}: {
  groupId: string;
  weekOffset: number;
  members: Member[];
  entries: Entry[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [drag, setDrag] = useState<{ dayIndex: number; startMinute: number; currentMinute: number } | null>(
    null,
  );

  const days = useMemo(() => getWeekDays(weekOffset, new Date()), [weekOffset]);
  const colors = useMemo(() => assignColors(members.map((m) => m.id)), [members]);
  const entryIntervals = useMemo(
    () => entries.map((e) => ({ start: new Date(e.startsAt).getTime(), end: new Date(e.endsAt).getTime() })),
    [entries],
  );
  const { startHour, endHour } = useMemo(
    () => computeHourRange(entryIntervals, days),
    [entryIntervals, days],
  );
  const totalMinutes = (endHour - startHour) * 60;
  const gridHeight = (endHour - startHour) * HOUR_PX;

  function minuteFromPointer(clientY: number, columnEl: HTMLElement) {
    const rect = columnEl.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const minute = startHour * 60 + ratio * totalMinutes;
    return Math.round(minute / 15) * 15;
  }

  function onPointerDown(dayIndex: number, e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const minute = minuteFromPointer(e.clientY, e.currentTarget);
    setDrag({ dayIndex, startMinute: minute, currentMinute: minute });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const minute = minuteFromPointer(e.clientY, e.currentTarget);
    setDrag({ ...drag, currentMinute: minute });
  }

  async function onPointerUp() {
    if (!drag) return;
    const lo = Math.min(drag.startMinute, drag.currentMinute);
    const hi = Math.max(drag.startMinute, drag.currentMinute);
    setDrag(null);
    if (hi - lo < 15) return;

    const day = days[drag.dayIndex];
    const startsAt = new Date(day.getTime() + lo * 60_000);
    const endsAt = new Date(day.getTime() + hi * 60_000);
    setPending(true);
    await addAvailability({ groupId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    setPending(false);
    router.refresh();
  }

  async function onRemove(entryId: string) {
    setPending(true);
    await removeAvailability(entryId);
    setPending(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push(`/groups/${groupId}/availability?week=${weekOffset - 1}`)}
        >
          ← Previous week
        </Button>
        <p className="text-sm text-muted-foreground">
          {days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
          {days[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push(`/groups/${groupId}/availability?week=${weekOffset + 1}`)}
        >
          Next week →
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`h-2.5 w-2.5 rounded-full ${colors[m.id].dot}`} />
            {m.displayName}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-neutral-950">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[3rem_repeat(7,1fr)] text-xs">
            <div />
            {days.map((day, i) => (
              <div
                key={i}
                className="border-b border-neutral-800 py-1.5 text-center font-medium text-neutral-200"
              >
                {day.toLocaleDateString("en-US", { weekday: "short" })}
                <br />
                <span className="font-mono text-neutral-500">{day.getDate()}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[3rem_repeat(7,1fr)]">
            <div className="relative" style={{ height: gridHeight }}>
              {Array.from({ length: endHour - startHour }, (_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 -translate-y-1/2 pr-2 text-right font-mono text-[10px] text-neutral-500"
                  style={{ top: i * HOUR_PX }}
                >
                  {String(startHour + i).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {days.map((day, dayIndex) => (
              <div
                key={dayIndex}
                className="relative touch-none border-l border-neutral-800"
                style={{ height: gridHeight }}
                onPointerDown={(e) => onPointerDown(dayIndex, e)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                {Array.from({ length: endHour - startHour }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-neutral-900"
                    style={{ top: i * HOUR_PX }}
                  />
                ))}

                {entries.flatMap((entry) =>
                  splitEntryByDay(
                    { start: new Date(entry.startsAt).getTime(), end: new Date(entry.endsAt).getTime() },
                    days,
                  )
                    .filter((seg) => seg.dayIndex === dayIndex)
                    .map((seg, i) => (
                      <div
                        key={`${entry.id}-${i}`}
                        className={`absolute left-0.5 right-0.5 rounded-sm ${colors[entry.userId].bar} mix-blend-screen ${
                          entry.userId === currentUserId ? "cursor-pointer" : "pointer-events-none"
                        }`}
                        style={{
                          top: (seg.startMinute - startHour * 60) * (HOUR_PX / 60),
                          height: Math.max(4, (seg.endMinute - seg.startMinute) * (HOUR_PX / 60)),
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => entry.userId === currentUserId && onRemove(entry.id)}
                        title={entry.userId === currentUserId ? "Click to remove" : undefined}
                      />
                    )),
                )}

                {drag?.dayIndex === dayIndex && (
                  <div
                    className="absolute left-0.5 right-0.5 rounded-sm bg-white/40"
                    style={{
                      top: (Math.min(drag.startMinute, drag.currentMinute) - startHour * 60) * (HOUR_PX / 60),
                      height: Math.max(4, Math.abs(drag.currentMinute - drag.startMinute) * (HOUR_PX / 60)),
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {pending && <p className="text-xs text-muted-foreground">Saving…</p>}
    </div>
  );
}
