type Window = { startsAt: string; endsAt: string };

export function FreeTimeList({
  respondedCount,
  windows,
}: {
  respondedCount: number;
  windows: Window[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {respondedCount} member{respondedCount === 1 ? "" : "s"} responded.
      </p>
      {windows.length === 0 && (
        <p className="text-sm text-muted-foreground">No overlap found yet.</p>
      )}
      <ul className="flex flex-col gap-1">
        {windows.map((w, i) => (
          <li key={i} className="rounded-lg border p-3 text-sm">
            {new Date(w.startsAt).toLocaleString()} —{" "}
            {new Date(w.endsAt).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
