type Bar = { userId: string; displayName: string; completedEffort: number; barPercent: number };

export function FairnessBars({ bars }: { bars: Bar[] }) {
  if (bars.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">Who&apos;s done what (completed effort)</p>
      {bars.map((b) => (
        <div key={b.userId} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 truncate">{b.displayName}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${b.barPercent}%` }} />
          </div>
          <span className="w-6 shrink-0 text-right text-muted-foreground">{b.completedEffort}</span>
        </div>
      ))}
    </div>
  );
}
