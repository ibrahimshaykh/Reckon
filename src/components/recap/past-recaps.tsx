import { formatMoney } from "@/lib/money";

type PastRecap = { month: string; totalSpentCents: number };

export function PastRecaps({ recaps, currency }: { recaps: PastRecap[]; currency: string }) {
  if (recaps.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">Past months</p>
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
