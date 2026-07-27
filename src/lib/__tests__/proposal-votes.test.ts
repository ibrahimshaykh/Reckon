import { describe, it, expect } from "vitest";
import { tallyVotes, computeProposalOutcome } from "@/lib/proposal-votes";

describe("tallyVotes", () => {
  it("counts each choice separately", () => {
    const votes = [
      { choice: "YES" as const },
      { choice: "YES" as const },
      { choice: "IF_NEEDED" as const },
      { choice: "NO" as const },
    ];
    expect(tallyVotes(votes)).toEqual({ yes: 2, ifNeeded: 1, no: 1 });
  });

  it("returns all zeros for no votes", () => {
    expect(tallyVotes([])).toEqual({ yes: 0, ifNeeded: 0, no: 0 });
  });
});

describe("computeProposalOutcome", () => {
  it("stays undecided while anyone hasn't voted", () => {
    const votes = [{ choice: "YES" as const }];
    expect(computeProposalOutcome(votes, 3)).toBeNull();
  });

  it("agrees once everyone has voted and nobody said no", () => {
    const votes = [{ choice: "YES" as const }, { choice: "IF_NEEDED" as const }];
    expect(computeProposalOutcome(votes, 2)).toBe("AGREED");
  });

  it("rejects once everyone has voted and at least one said no", () => {
    const votes = [{ choice: "YES" as const }, { choice: "NO" as const }];
    expect(computeProposalOutcome(votes, 2)).toBe("REJECTED");
  });

  it("treats a single-member group as decided by their own vote", () => {
    expect(computeProposalOutcome([{ choice: "YES" as const }], 1)).toBe("AGREED");
    expect(computeProposalOutcome([{ choice: "NO" as const }], 1)).toBe("REJECTED");
  });
});
