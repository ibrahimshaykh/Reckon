import { describe, it, expect } from "vitest";
import { computeProposalFlags } from "@/lib/constraint-check";

describe("computeProposalFlags", () => {
  it("flags over-budget and unmet dietary restrictions, leaves a clean member alone", () => {
    const flags = computeProposalFlags(
      { estimatedCostPerPersonCents: 3000, dietaryTags: [] },
      [
        { userId: "M1", budgetLimitCents: 2000, dietaryRestrictions: [] },
        { userId: "M2", budgetLimitCents: null, dietaryRestrictions: ["vegan"] },
        { userId: "M3", budgetLimitCents: 5000, dietaryRestrictions: [] },
      ],
    );

    expect(flags).toEqual([
      {
        userId: "M1",
        reason: "OVER_BUDGET",
        detail: "Estimated $30.00 per person exceeds their $20.00 limit.",
      },
      { userId: "M2", reason: "DIETARY_CONFLICT", detail: "Doesn't cover: vegan." },
    ]);
  });

  it("flags nothing when the proposal has no cost and no member restrictions", () => {
    const flags = computeProposalFlags(
      { estimatedCostPerPersonCents: null, dietaryTags: [] },
      [{ userId: "M1", budgetLimitCents: 2000, dietaryRestrictions: [] }],
    );
    expect(flags).toEqual([]);
  });

  it("doesn't flag a member without a budget limit even if the cost is high", () => {
    const flags = computeProposalFlags(
      { estimatedCostPerPersonCents: 100_00, dietaryTags: [] },
      [{ userId: "M1", budgetLimitCents: null, dietaryRestrictions: [] }],
    );
    expect(flags).toEqual([]);
  });
});
