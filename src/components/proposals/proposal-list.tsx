"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { castVote } from "@/lib/actions/proposals";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";

type VoteChoice = "YES" | "IF_NEEDED" | "NO";

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
  status: string;
  myVote: VoteChoice | null;
  totalMembers: number;
  tally: { yes: number; ifNeeded: number; no: number } | null;
  voterBreakdown: { userName: string; choice: VoteChoice }[] | null;
};

const CHOICE_LABEL: Record<VoteChoice, string> = {
  YES: "Yes",
  IF_NEEDED: "If needed",
  NO: "No",
};

export function ProposalList({
  proposals,
  currency,
}: {
  proposals: Proposal[];
  currency: string;
}) {
  if (proposals.length === 0) {
    return <p className="text-sm text-muted-foreground">No proposals yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {proposals.map((p) => (
        <ProposalRow key={p.id} proposal={p} currency={currency} />
      ))}
    </ul>
  );
}

function ProposalRow({ proposal: p, currency }: { proposal: Proposal; currency: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onVote(choice: VoteChoice) {
    setPending(true);
    await castVote(p.id, choice);
    setPending(false);
    router.refresh();
  }

  return (
    <li className="rounded-lg border p-3 text-sm">
      <p>
        <strong>{p.title}</strong> — proposed by {p.proposedByName}
        {p.estimatedCostPerPerson !== null &&
          `, ~${formatMoney(Math.round(p.estimatedCostPerPerson * 100), currency)}/person`}
        {p.isFairestPick && (
          <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
            Fairest pick
          </span>
        )}
        {p.status === "AGREED" && (
          <span className="ml-2 rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
            ✓ Agreed
          </span>
        )}
        {p.status === "REJECTED" && (
          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            ✗ Not happening
          </span>
        )}
      </p>
      {p.dietaryTags.length > 0 && (
        <p className="text-xs text-muted-foreground">Covers: {p.dietaryTags.join(", ")}</p>
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

      <div className="mt-2">
        {p.myVote === null && p.status === "PROPOSED" ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Can you make it?</span>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => onVote("YES")}>
              Yes
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => onVote("IF_NEEDED")}>
              If needed
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => onVote("NO")}>
              No
            </Button>
          </div>
        ) : (
          p.tally && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">
                {p.tally.yes} yes · {p.tally.ifNeeded} if needed · {p.tally.no} no · (
                {p.tally.yes + p.tally.ifNeeded + p.tally.no}/{p.totalMembers} voted)
                {p.myVote && ` — you voted ${CHOICE_LABEL[p.myVote]}`}
              </p>
              {p.voterBreakdown && p.voterBreakdown.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.voterBreakdown.map((v, i) => (
                    <span
                      key={i}
                      className={`rounded px-1.5 py-0.5 text-[0.7rem] ${
                        v.choice === "YES"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : v.choice === "IF_NEEDED"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {v.userName}: {CHOICE_LABEL[v.choice]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </li>
  );
}
