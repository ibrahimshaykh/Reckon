import { describe, it, expect } from "vitest";
import { buildItemizedShares } from "@/lib/receipt-split";

describe("buildItemizedShares", () => {
  it("splits each item equally among whoever claimed it", () => {
    const shares = buildItemizedShares(
      [
        { label: "Milk", amountCents: 400, participantIds: ["a", "b"] },
        { label: "Chicken", amountCents: 1200, participantIds: ["a"] },
      ],
      1600,
    );
    expect(shares).toEqual([
      { label: "Milk", amountCents: 400, shares: { a: 0.5, b: 0.5 } },
      { label: "Chicken", amountCents: 1200, shares: { a: 1 } },
    ]);
  });

  it("adds no remainder item when the total matches the sum of items", () => {
    const shares = buildItemizedShares(
      [{ label: "Coffee", amountCents: 500, participantIds: ["a"] }],
      500,
    );
    expect(shares).toHaveLength(1);
  });

  it("distributes a tax/remainder proportionally by claimed subtotal, not evenly", () => {
    const shares = buildItemizedShares(
      [
        { label: "Coffee", amountCents: 200, participantIds: ["a"] },
        { label: "Entree", amountCents: 800, participantIds: ["b"] },
      ],
      1100, // $1 of tax/fees on top of the $10 subtotal
    );
    const taxShare = shares.find((s) => s.label === "Tax & other charges");
    expect(taxShare?.amountCents).toBe(100);
    expect(taxShare?.shares.a).toBeCloseTo(0.2); // $2 of $10 claimed
    expect(taxShare?.shares.b).toBeCloseTo(0.8); // $8 of $10 claimed
  });

  it("skips the remainder if nobody claimed anything to prorate against", () => {
    const shares = buildItemizedShares([{ label: "Milk", amountCents: 400, participantIds: [] }], 500);
    expect(shares.find((s) => s.label === "Tax & other charges")).toBeUndefined();
  });
});
