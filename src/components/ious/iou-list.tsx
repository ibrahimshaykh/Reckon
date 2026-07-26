type IOU = {
  id: string;
  fromName: string;
  toName: string;
  amount: number;
  note: string | null;
};

export function IOUList({ ious }: { ious: IOU[] }) {
  if (ious.length === 0) {
    return <p className="text-sm text-muted-foreground">No IOUs yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {ious.map((i) => (
        <li key={i.id} className="rounded-lg border p-3 text-sm">
          <strong>{i.fromName}</strong> owes <strong>{i.toName}</strong> $
          {i.amount.toFixed(2)}
          {i.note && ` — ${i.note}`}
        </li>
      ))}
    </ul>
  );
}
