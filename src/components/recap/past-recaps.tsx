import { formatMoney } from "@/lib/money";
import type { Dictionary } from "@/lib/dictionary";

type PastRecap = { month: string; totalSpentCents: number };

export function PastRecaps({
  recaps,
  currency,
  dict,
}: {
  recaps: PastRecap[];
  currency: string;
  dict: Dictionary;
}) {
  if (recaps.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">{dict.recap.pastMonths}</p>
      {/* One ruled column rather than a stack of boxes: these are the same
          month-and-total pair repeated, so a border round each one drew six
          edges to say what one column of dot leaders says. */}
      <ul className="flex flex-col">
        {recaps.map((r, i) => (
          <li
            key={i}
            className="flex items-baseline gap-2 border-b border-rule/50 py-1.5 text-sm last:border-0"
          >
            <span>{r.month}</span>
            <span aria-hidden className="leader-fill" />
            <span className="tabular text-muted-foreground">
              {formatMoney(r.totalSpentCents, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
