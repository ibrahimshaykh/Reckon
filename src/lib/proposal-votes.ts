export type VoteChoice = "YES" | "IF_NEEDED" | "NO";

export type VoteTally = { yes: number; ifNeeded: number; no: number };

export function tallyVotes(votes: { choice: VoteChoice }[]): VoteTally {
  const tally: VoteTally = { yes: 0, ifNeeded: 0, no: 0 };
  for (const vote of votes) {
    if (vote.choice === "YES") tally.yes++;
    else if (vote.choice === "IF_NEEDED") tally.ifNeeded++;
    else tally.no++;
  }
  return tally;
}

// Auto-decides once every member has cast a vote. In a small trusted group
// a single firm "No" is treated as a real veto — better to not force a plan
// on someone who explicitly objected than to make the majority happy at
// their expense. Stays undecided (null) while anyone hasn't voted yet.
export function computeProposalOutcome(
  votes: { choice: VoteChoice }[],
  totalMembers: number,
): "AGREED" | "REJECTED" | null {
  if (votes.length < totalMembers) return null;
  return tallyVotes(votes).no > 0 ? "REJECTED" : "AGREED";
}
