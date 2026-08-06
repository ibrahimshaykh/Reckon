"use client";

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/dictionary";
import {
  monthGrid,
  parseIso,
  shiftMonth,
  type YearMonth,
} from "@/lib/calendar-grid";

/**
 * A date field with a calendar drawn in the app's own hand.
 *
 * The browser's native picker cannot be styled at all — it is painted outside
 * the page, so no rule here reaches it — which left one grey system panel in
 * the middle of a page pretending to be paper.
 *
 * The native input itself stays. It is what carries typing, keyboard support,
 * the mobile date wheel and the correct value format; replacing it with a
 * button would have thrown all of that away to change how a popup looks. Only
 * the browser's calendar icon is hidden, and our own button sits beside it.
 */

// Pinned to en-US like every other date in this app. An unpinned locale here
// is a real hydration mismatch — the server and the reader's browser disagree
// about the words — and this codebase has already been caught by it once.
const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

// Sunday first, matching the week grid on the availability page.
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function DateField({
  value,
  onChange,
  ariaLabel,
  dict,
  tone,
  className,
  inputClassName,
}: {
  /** YYYY-MM-DD. */
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  /** For the month arrows, which are controls and so get translated. The month
      name itself does not — see the note on MONTH_LABEL. */
  dict: Dictionary;
  /** The page's own ink, e.g. var(--feature-chores). */
  tone?: string;
  className?: string;
  inputClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  // Paging the calendar shouldn't change the selection, so the month on view
  // is held separately — but only while the popup is open. Reopening it should
  // land back on the chosen date rather than wherever the last browse ended.
  const [browsing, setBrowsing] = useState<YearMonth | null>(null);

  const selected = parseIso(value);
  const view: YearMonth =
    browsing ?? (selected ? { y: selected.y, m: selected.m } : monthOfToday());

  const accent = tone ?? "var(--primary)";

  function choose(iso: string) {
    onChange(iso);
    setOpen(false);
    setBrowsing(null);
  }

  return (
    <span
      className={cn(
        "date-field inline-flex items-center gap-1 rounded-md border bg-background ps-2 text-sm",
        className,
      )}
    >
      <input
        type="date"
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "min-w-0 border-0 bg-transparent py-1.5 outline-none",
          inputClassName,
        )}
      />

      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setBrowsing(null);
        }}
      >
        <Popover.Trigger
          aria-label={ariaLabel}
          className="shrink-0 rounded-e-md px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <CalendarDays className="size-4" />
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Positioner sideOffset={8}>
            <Popover.Popup
              className="sketch-box z-50 bg-card p-3 outline-none"
              style={{ borderColor: accent }}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  aria-label={dict.common.previousMonth}
                  onClick={() => setBrowsing(shiftMonth(view, -1))}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {/* Logical, so the arrows swap round in Urdu rather than
                      pointing backwards. */}
                  <ChevronLeft className="size-4 rtl:hidden" />
                  <ChevronRight className="hidden size-4 rtl:block" />
                </button>

                <span className="text-sm font-medium">
                  {MONTH_LABEL.format(new Date(Date.UTC(view.y, view.m, 1)))}
                </span>

                <button
                  type="button"
                  aria-label={dict.common.nextMonth}
                  onClick={() => setBrowsing(shiftMonth(view, 1))}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ChevronRight className="size-4 rtl:hidden" />
                  <ChevronLeft className="hidden size-4 rtl:block" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {WEEKDAYS.map((d) => (
                  <span
                    key={d}
                    className="grid size-8 place-items-center text-[0.65rem] tracking-wide text-muted-foreground uppercase"
                  >
                    {d}
                  </span>
                ))}

                {monthGrid(view).map((cell) => {
                  const isSelected = cell.iso === value;
                  const isToday = cell.iso === todayIso();

                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      aria-current={isToday ? "date" : undefined}
                      aria-pressed={isSelected}
                      onClick={() => choose(cell.iso)}
                      style={
                        isSelected
                          ? { background: accent, color: "var(--card)" }
                          : isToday
                            ? { color: accent }
                            : undefined
                      }
                      className={cn(
                        "tabular grid size-8 place-items-center rounded text-sm transition-colors",
                        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        !isSelected && "hover:bg-accent",
                        // The neighbouring month is shown so the weeks stay
                        // whole, but it is not this month and shouldn't read
                        // as though it were.
                        !cell.inMonth && "text-muted-foreground/50",
                        // Today gets ringed rather than filled: filling it
                        // would make it compete with the day you actually
                        // picked, and only one of the two is a choice.
                        isToday && !isSelected && "circled",
                      )}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </span>
  );
}

// Only ever called from inside the popup, which cannot render until the reader
// has clicked something — so "today" is always the reader's own today and never
// the server's.
function todayIso(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

function monthOfToday(): YearMonth {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() };
}
