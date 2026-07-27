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
      <ul className="flex flex-col gap-1">
        {recaps.map((r, i) => (
          <li key={i} className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm">
            <span>{r.month}</span>
            <span className="text-muted-foreground">{formatMoney(r.totalSpentCents, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
