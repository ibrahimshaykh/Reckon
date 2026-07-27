"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addAvailability, removeAvailability } from "@/lib/actions/availability";
import {
  getWeekDays,
  formatDateParam,
  parseDateParam,
  getEntrySegments,
  computeHourRange,
  computeBestOverlap,
  assignColors,
  type EntryLike,
} from "@/lib/availability-grid";
import type { Dictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

type Member = { id: string; displayName: string };
type Entry = {
  id: string;
  userId: string;
  startsAt: string;
  endsAt: string;
  label: string | null;
  recurring: boolean;
};

const HOUR_PX = 48;

function formatMinuteOfDay(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function WeekGrid({
  groupId,
  startDate,
  members,
  entries,
  currentUserId,
  dict,
}: {
  groupId: string;
  startDate: string;
  members: Member[];
  entries: Entry[];
  currentUserId: string;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [recurringMode, setRecurringMode] = useState(false);
  const [drag, setDrag] = useState<{ dayIndex: number; startMinute: number; currentMinute: number } | null>(
    null,
  );
  const [hover, setHover] = useState<{ dayIndex: number; minute: number; x: number; y: number } | null>(
    null,
  );

  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => getWeekDays(parseDateParam(startDate, today)), [startDate, today]);
  const colors = useMemo(() => assignColors(members.map((m) => m.id)), [members]);
  const entryIntervals: (EntryLike & { userId: string })[] = useMemo(
    () =>
      entries.map((e) => ({
        userId: e.userId,
        start: new Date(e.startsAt).getTime(),
        end: new Date(e.endsAt).getTime(),
        recurring: e.recurring,
      })),
    [entries],
  );
  const { startHour, endHour } = useMemo(
    () => computeHourRange(entryIntervals, days),
    [entryIntervals, days],
  );
  const best = useMemo(() => computeBestOverlap(entryIntervals, days), [entryIntervals, days]);
  const totalMinutes = (endHour - startHour) * 60;
  const gridHeight = (endHour - startHour) * HOUR_PX;
  const minuteToPx = (minute: number) => (minute - startHour * 60) * (HOUR_PX / 60);

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
    await addAvailability({
      groupId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      recurring: recurringMode,
    });
    setPending(false);
    router.refresh();
  }

  function onMouseMove(dayIndex: number, e: React.MouseEvent<HTMLDivElement>) {
    if (drag) return;
    const minute = minuteFromPointer(e.clientY, e.currentTarget);
    setHover({ dayIndex, minute, x: e.clientX, y: e.clientY });
  }

  async function onRemove(entryId: string) {
    setPending(true);
    await removeAvailability(entryId);
    setPending(false);
    router.refresh();
  }

  function goToStart(next: Date) {
    router.push(`/groups/${groupId}/availability?start=${formatDateParam(next)}`);
  }

  const hoverNames = useMemo(() => {
    if (!hover) return [];
    const freeUserIds = new Set(
      entryIntervals
        .filter((entry) =>
          getEntrySegments(entry, days).some(
            (seg) =>
              seg.dayIndex === hover.dayIndex &&
              hover.minute >= seg.startMinute &&
              hover.minute < seg.endMinute,
          ),
        )
        .map((e) => e.userId),
    );
    return members.filter((m) => freeUserIds.has(m.id)).map((m) => m.displayName);
  }, [hover, entryIntervals, days, members]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={() => goToStart(new Date(days[0].getTime() - 7 * 86_400_000))}>
          {dict.availability.prevWeek}
        </Button>
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {/* Date range display is pinned to en-US regardless of UI
                language, deliberately — see the note on formatMinuteOfDay's
                caller below for why locale-dependent Intl formatting here
                is a real hydration-mismatch risk this app already hit once. */}
            {days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
            {days[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
          <input
            type="date"
            aria-label={dict.availability.jumpToDate}
            className="rounded-md border bg-transparent px-1.5 py-0.5 text-xs text-muted-foreground"
            value={formatDateParam(days[0])}
            onChange={(e) => e.target.value && goToStart(parseDateParam(e.target.value, days[0]))}
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => goToStart(new Date(days[0].getTime() + 7 * 86_400_000))}>
          {dict.availability.nextWeek}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`h-2.5 w-2.5 rounded-full ${colors[m.id].dot}`} />
              {m.displayName}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">{dict.availability.addingLabel}</span>
          <Button
            size="sm"
            variant={recurringMode ? "ghost" : "secondary"}
            onClick={() => setRecurringMode(false)}
          >
            {dict.availability.oneTime}
          </Button>
          <Button
            size="sm"
            variant={recurringMode ? "secondary" : "ghost"}
            onClick={() => setRecurringMode(true)}
          >
            {dict.availability.repeatsWeekly}
          </Button>
        </div>
      </div>

      {best && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {interpolate(dict.availability.bestTime, {
            weekday: days[best.dayIndex].toLocaleDateString("en-US", { weekday: "long" }),
            start: formatMinuteOfDay(best.startMinute),
            end: formatMinuteOfDay(best.endMinute),
            count: best.count,
            total: members.length,
          })}
        </p>
      )}

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
                onMouseMove={(e) => onMouseMove(dayIndex, e)}
                onMouseLeave={() => setHover(null)}
              >
                {Array.from({ length: endHour - startHour }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-neutral-900"
                    style={{ top: i * HOUR_PX }}
                  />
                ))}

                {entries.flatMap((entry) =>
                  getEntrySegments(
                    {
                      start: new Date(entry.startsAt).getTime(),
                      end: new Date(entry.endsAt).getTime(),
                      recurring: entry.recurring,
                    },
                    days,
                  )
                    .filter((seg) => seg.dayIndex === dayIndex)
                    .map((seg, i) => (
                      <div
                        key={`${entry.id}-${i}`}
                        className={`absolute left-0.5 right-0.5 rounded-sm ${colors[entry.userId].bar} mix-blend-screen ${
                          entry.recurring ? "border-2 border-dashed border-white/50" : ""
                        } ${entry.userId === currentUserId ? "cursor-pointer" : "pointer-events-none"}`}
                        style={{
                          top: minuteToPx(seg.startMinute),
                          height: Math.max(4, (seg.endMinute - seg.startMinute) * (HOUR_PX / 60)),
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => entry.userId === currentUserId && onRemove(entry.id)}
                        title={entry.userId === currentUserId ? dict.availability.clickToRemove : undefined}
                      />
                    )),
                )}

                {best && best.dayIndex === dayIndex && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 rounded-sm ring-2 ring-amber-300"
                    style={{
                      top: minuteToPx(best.startMinute),
                      height: Math.max(4, (best.endMinute - best.startMinute) * (HOUR_PX / 60)),
                    }}
                  />
                )}

                {drag?.dayIndex === dayIndex && (
                  <div
                    className="absolute left-0.5 right-0.5 rounded-sm bg-white/40"
                    style={{
                      top: minuteToPx(Math.min(drag.startMinute, drag.currentMinute)),
                      height: Math.max(4, Math.abs(drag.currentMinute - drag.startMinute) * (HOUR_PX / 60)),
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {hover && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <p className="font-medium">{formatMinuteOfDay(hover.minute)}</p>
          {hoverNames.length > 0 ? (
            <p className="text-muted-foreground">
              {interpolate(dict.availability.freeNames, {
                names: hoverNames.join(", "),
                n: hoverNames.length,
                total: members.length,
              })}
            </p>
          ) : (
            <p className="text-muted-foreground">{dict.availability.nobodyFree}</p>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{dict.availability.legend}</p>
      {pending && <p className="text-xs text-muted-foreground">{dict.availability.saving}</p>}
    </div>
  );
}
