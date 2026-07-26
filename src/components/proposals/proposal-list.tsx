type Proposal = {
  id: string;
  title: string;
  proposedByName: string;
  estimatedCostPerPerson: number | null;
  dietaryTags: string[];
  latitude: number | null;
  longitude: number | null;
  totalDistanceKm: number | null;
  isFairestPick: boolean;
  flags: { userName: string; reason: string; detail: string }[];
};

export function ProposalList({ proposals }: { proposals: Proposal[] }) {
  if (proposals.length === 0) {
    return <p className="text-sm text-muted-foreground">No proposals yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {proposals.map((p) => (
        <li key={p.id} className="rounded-lg border p-3 text-sm">
          <p>
            <strong>{p.title}</strong> — proposed by {p.proposedByName}
            {p.estimatedCostPerPerson !== null &&
              `, ~$${p.estimatedCostPerPerson.toFixed(2)}/person`}
            {p.isFairestPick && (
              <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                Fairest pick
              </span>
            )}
          </p>
          {p.dietaryTags.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Covers: {p.dietaryTags.join(", ")}
            </p>
          )}
          {p.totalDistanceKm !== null && (
            <p className="text-xs text-muted-foreground">
              ~{p.totalDistanceKm.toFixed(1)} km total travel —{" "}
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Directions
              </a>
            </p>
          )}
          {p.flags.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {p.flags.map((f, i) => (
                <li key={i} className="text-xs text-destructive">
                  ⚠ {f.userName}: {f.detail}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
