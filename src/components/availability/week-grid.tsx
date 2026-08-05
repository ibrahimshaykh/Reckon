"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addAvailability, removeAvailability } from "@/lib/actions/availability";
import { isActionError } from "@/lib/action-result";
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
import { DateField } from "@/components/ui/date-field";

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
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    const result = await addAvailability({
      groupId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      recurring: recurringMode,
    });
    setPending(false);
    if (isActionError(result)) {
      setError(result.error);
    } else {
      router.refresh();
    }
  }

  function onMouseMove(dayIndex: number, e: React.MouseEvent<HTMLDivElement>) {
    if (drag) return;
    const minute = minuteFromPointer(e.clientY, e.currentTarget);
    setHover({ dayIndex, minute, x: e.clientX, y: e.clientY });
  }

  async function onRemove(entryId: string) {
    setPending(true);
    setError(null);
    const result = await removeAvailability(entryId);
    setPending(false);
    if (isActionError(result)) {
      setError(result.error);
    } else {
      router.refresh();
    }
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
      {/* Wraps, because two buttons either side of a date range and a date
          picker do not fit across a 360px phone, and with nothing able to give
          they took the whole page into horizontal scroll. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={() => goToStart(new Date(days[0].getTime() - 7 * 86_400_000))}>
          {dict.availability.prevWeek}
        </Button>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {/* Date range display is pinned to en-US regardless of UI
                language, deliberately — see the note on formatMinuteOfDay's
                caller below for why locale-dependent Intl formatting here
                is a real hydration-mismatch risk this app already hit once. */}
            {days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
            {days[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
          <DateField
            ariaLabel={dict.availability.jumpToDate}
            tone="var(--feature-availability)"
            className="text-xs text-muted-foreground"
            inputClassName="py-0.5"
            value={formatDateParam(days[0])}
            onChange={(next) => next && goToStart(parseDateParam(next, days[0]))}
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
        // The one line on this page anybody came for. In its own blue rather
        // than amber, which on every other page of this app means a chore.
        <p
          style={{ color: "var(--feature-availability)" }}
          className="text-sm font-medium"
        >
          {interpolate(dict.availability.bestTime, {
            weekday: days[best.dayIndex].toLocaleDateString("en-US", { weekday: "long" }),
            start: formatMinuteOfDay(best.startMinute),
            end: formatMinuteOfDay(best.endMinute),
            count: best.count,
            total: members.length,
          })}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-rule bg-card">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[3rem_repeat(7,1fr)] text-xs">
            <div />
            {days.map((day, i) => {
              const isToday = day.toDateString() === new Date().toDateString();
              return (
                <div
                  key={i}
                  className={`border-b border-rule py-2 text-center font-medium ${
                    isToday ? "text-primary" : "text-foreground"
                  }`}
                >
                  {day.toLocaleDateString("en-US", { weekday: "short" })}
                  <br />
                  <span
                    className={`font-mono ${
                      isToday
                        ? "inline-grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-[3rem_repeat(7,1fr)]">
            <div className="relative" style={{ height: gridHeight }}>
              {Array.from({ length: endHour - startHour }, (_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 -translate-y-1/2 pr-2 text-right font-mono text-[10px] text-muted-foreground"
                  style={{ top: i * HOUR_PX }}
                >
                  {String(startHour + i).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {days.map((day, dayIndex) => (
              <div
                key={dayIndex}
                className="relative touch-none border-l border-rule transition-colors hover:bg-accent/25"
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
                    className="absolute left-0 right-0 border-t border-rule/50"
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
                        className={`absolute left-0.5 right-0.5 rounded-md ${colors[entry.userId].bar} mix-blend-multiply transition-opacity dark:mix-blend-screen ${
                          entry.recurring
                            ? "border-2 border-dashed border-foreground/40"
                            : ""
                        } ${
                          entry.userId === currentUserId
                            ? "cursor-pointer hover:opacity-70"
                            : "pointer-events-none"
                        }`}
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
                  // Ringed the way somebody circles the one slot everybody can
                  // make. Drawn round rather than square, and slightly outside
                  // the block, so it reads as a mark made on the timetable
                  // rather than as another booking on it.
                  <div
                    className="circled pointer-events-none absolute -inset-x-1"
                    style={{
                      top: minuteToPx(best.startMinute) - 4,
                      height:
                        Math.max(4, (best.endMinute - best.startMinute) * (HOUR_PX / 60)) + 8,
                      color: "var(--feature-availability)",
                    }}
                  />
                )}

                {drag?.dayIndex === dayIndex && (
                  <div
                    className="absolute left-0.5 right-0.5 rounded-md border border-primary/60 bg-primary/30"
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
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
