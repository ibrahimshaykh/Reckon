export type ProposalInput = {
  estimatedCostPerPersonCents: number | null;
  dietaryTags: string[];
};

export type MemberConstraints = {
  userId: string;
  budgetLimitCents: number | null;
  dietaryRestrictions: string[];
};

export type ProposalFlag = {
  userId: string;
  reason: "OVER_BUDGET" | "DIETARY_CONFLICT";
  detail: string;
};

// Flags against each member's own stated limits — never picks for the
// group, since taste is subjective and an algorithm can't settle that.
export function computeProposalFlags(
  proposal: ProposalInput,
  members: MemberConstraints[],
): ProposalFlag[] {
  const flags: ProposalFlag[] = [];

  for (const member of members) {
    if (
      proposal.estimatedCostPerPersonCents !== null &&
      member.budgetLimitCents !== null &&
      proposal.estimatedCostPerPersonCents > member.budgetLimitCents
    ) {
      flags.push({
        userId: member.userId,
        reason: "OVER_BUDGET",
        detail: `Estimated $${(proposal.estimatedCostPerPersonCents / 100).toFixed(2)} per person exceeds their $${(member.budgetLimitCents / 100).toFixed(2)} limit.`,
      });
    }

    const unmet = member.dietaryRestrictions.filter(
      (r) => !proposal.dietaryTags.includes(r),
    );
    if (unmet.length > 0) {
      flags.push({
        userId: member.userId,
        reason: "DIETARY_CONFLICT",
        detail: `Doesn't cover: ${unmet.join(", ")}.`,
      });
    }
  }

  return flags;
}
