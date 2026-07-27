import type { Dictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";

type Window = { startsAt: string; endsAt: string };

export function FreeTimeList({
  respondedCount,
  windows,
  dict,
}: {
  respondedCount: number;
  windows: Window[];
  dict: Dictionary;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {interpolate(respondedCount === 1 ? dict.availability.respondedOne : dict.availability.respondedMany, {
          n: respondedCount,
        })}
      </p>
      {windows.length === 0 && (
        <p className="text-sm text-muted-foreground">{dict.availability.noOverlap}</p>
      )}
      <ul className="flex flex-col gap-1">
        {windows.map((w, i) => (
          <li key={i} className="rounded-lg border p-3 text-sm">
            {/* Pinned to en-US, not the runtime default — a bare
                .toLocaleString() would pick server/browser default locales
                that can genuinely differ, causing a hydration mismatch
                (the exact bug already found and fixed in formatMoney). */}
            {new Date(w.startsAt).toLocaleString("en-US")} —{" "}
            {new Date(w.endsAt).toLocaleString("en-US")}
          </li>
        ))}
      </ul>
    </div>
  );
}
