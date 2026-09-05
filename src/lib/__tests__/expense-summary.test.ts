import { describe, expect, it } from "vitest";
import { summariseExpense, joinNames } from "@/lib/expense-summary";

const IBRAHIM = { id: "u1", name: "Ibrahim" };
const LOLA = { id: "u2", name: "Lola" };
const SARA = { id: "u3", name: "Sara" };

describe("summariseExpense", () => {
  it("says 'shared' when the payer is one of the people splitting it", () => {
    expect(summariseExpense("u1", "Ibrahim", [IBRAHIM, LOLA])).toEqual({
      kind: "sharedBy",
      payer: "Ibrahim",
      names: ["Lola"],
    });
  });

  // The sentence names the payer, so listing them again would read
  // "Lola paid, split with Lola and Ibrahim".
  it("leaves the payer out of the list they're being split with", () => {
    const summary = summariseExpense("u2", "Lola", [IBRAHIM, LOLA, SARA]);
    expect(summary).toEqual({
      kind: "sharedBy",
      payer: "Lola",
      names: ["Ibrahim", "Sara"],
    });
  });

  it("keeps the others in the order they arrived", () => {
    const summary = summariseExpense("u3", "Sara", [LOLA, SARA, IBRAHIM]);
    expect(summary).toEqual({
      kind: "sharedBy",
      payer: "Sara",
      names: ["Lola", "Ibrahim"],
    });
  });

  it("says 'bought for' when the payer took no share themselves", () => {
    // The coke case: Ibrahim paid, only Lola is ticked.
    expect(summariseExpense("u1", "Ibrahim", [LOLA])).toEqual({
      kind: "boughtFor",
      payer: "Ibrahim",
      names: ["Lola"],
    });
  });

  it("handles buying for several people at once", () => {
    expect(summariseExpense("u1", "Ibrahim", [LOLA, SARA])).toEqual({
      kind: "boughtFor",
      payer: "Ibrahim",
      names: ["Lola", "Sara"],
    });
  });

  it("says 'paid for themselves' when nobody else is in the split", () => {
    expect(summariseExpense("u1", "Ibrahim", [IBRAHIM])).toEqual({
      kind: "paidForSelf",
      payer: "Ibrahim",
    });
  });

  it("gives up gracefully when an expense has no participants at all", () => {
    // Shouldn't happen, but a legacy or malformed row must not crash a page.
    expect(summariseExpense("u1", "Ibrahim", [])).toEqual({ kind: "none" });
  });
});

describe("joinNames", () => {
  it("reads naturally at one, two and three names", () => {
    expect(joinNames(["Ibrahim"], "and")).toBe("Ibrahim");
    expect(joinNames(["Ibrahim", "Lola"], "and")).toBe("Ibrahim and Lola");
    expect(joinNames(["Ibrahim", "Lola", "Sara"], "and")).toBe("Ibrahim, Lola and Sara");
  });

  it("takes the conjunction as an argument so it can be localised", () => {
    expect(joinNames(["Ibrahim", "Lola"], "y")).toBe("Ibrahim y Lola");
  });

  it("returns nothing for an empty list rather than a stray conjunction", () => {
    expect(joinNames([], "and")).toBe("");
  });
});
