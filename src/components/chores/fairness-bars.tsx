type Bar = { userId: string; displayName: string; completedEffort: number; barPercent: number };

export function FairnessBars({ bars, title }: { bars: Bar[]; title: string }) {
  if (bars.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {bars.map((b) => (
        <div key={b.userId} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 truncate">{b.displayName}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${b.barPercent}%` }} />
          </div>
          {/* Wide enough for a weighted per-week figure. These used to be raw
              effort and rarely reached double digits; weighted, a few daily
              chores run into the hundreds and can carry a decimal. */}
          <span className="tabular w-12 shrink-0 text-right text-muted-foreground">
            {b.completedEffort}
          </span>
        </div>
      ))}
    </div>
  );
}
