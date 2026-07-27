"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { castVote } from "@/lib/actions/proposals";
import { formatMoney } from "@/lib/money";
import type { Dictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
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

export function ProposalList({
  proposals,
  currency,
  dict,
}: {
  proposals: Proposal[];
  currency: string;
  dict: Dictionary;
}) {
  if (proposals.length === 0) {
    return <p className="text-sm text-muted-foreground">{dict.proposals.noProposalsYet}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {proposals.map((p) => (
        <ProposalRow key={p.id} proposal={p} currency={currency} dict={dict} />
      ))}
    </ul>
  );
}

function ProposalRow({
  proposal: p,
  currency,
  dict,
}: {
  proposal: Proposal;
  currency: string;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const choiceLabel: Record<VoteChoice, string> = {
    YES: dict.proposals.voteYes,
    IF_NEEDED: dict.proposals.voteIfNeeded,
    NO: dict.proposals.voteNo,
  };

  async function onVote(choice: VoteChoice) {
    setPending(true);
    await castVote(p.id, choice);
    setPending(false);
    router.refresh();
  }

  return (
    <li className="rounded-lg border p-3 text-sm">
      <p>
        <strong>{p.title}</strong> {interpolate(dict.proposals.proposedBy, { name: p.proposedByName })}
        {p.estimatedCostPerPerson !== null &&
          interpolate(dict.proposals.perPerson, {
            amount: formatMoney(Math.round(p.estimatedCostPerPerson * 100), currency),
          })}
        {p.isFairestPick && (
          <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
            {dict.proposals.fairestPick}
          </span>
        )}
        {p.status === "AGREED" && (
          <span className="ml-2 rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
            {dict.proposals.agreed}
          </span>
        )}
        {p.status === "REJECTED" && (
          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {dict.proposals.notHappening}
          </span>
        )}
      </p>
      {p.dietaryTags.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {interpolate(dict.proposals.covers, { tags: p.dietaryTags.join(", ") })}
        </p>
      )}
      {p.totalDistanceKm !== null && (
        <p className="text-xs text-muted-foreground">
          {interpolate(dict.proposals.totalTravel, { km: p.totalDistanceKm.toFixed(1) })}
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            {dict.common.directions}
          </a>
        </p>
      )}
      {p.flags.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {p.flags.map((f, i) => (
            <li key={i} className="text-xs text-destructive">
              {interpolate(dict.proposals.flagLine, { userName: f.userName, detail: f.detail })}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2">
        {p.myVote === null && p.status === "PROPOSED" ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{dict.proposals.canYouMakeIt}</span>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => onVote("YES")}>
              {dict.proposals.voteYes}
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => onVote("IF_NEEDED")}>
              {dict.proposals.voteIfNeeded}
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => onVote("NO")}>
              {dict.proposals.voteNo}
            </Button>
          </div>
        ) : (
          p.tally && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">
                {interpolate(dict.proposals.tallyLine, {
                  yes: p.tally.yes,
                  ifNeeded: p.tally.ifNeeded,
                  no: p.tally.no,
                  voted: p.tally.yes + p.tally.ifNeeded + p.tally.no,
                  total: p.totalMembers,
                })}
                {p.myVote && interpolate(dict.proposals.youVoted, { choice: choiceLabel[p.myVote] })}
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
                      {v.userName}: {choiceLabel[v.choice]}
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
