import { describe, it, expect } from "vitest";
import { toCents, fromCents } from "@/lib/money";

describe("money", () => {
  it("converts dollars to cents", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(30)).toBe(3000);
  });

  it("rounds floating-point drift correctly", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("converts cents back to dollars", () => {
    expect(fromCents(1999)).toBe(19.99);
    expect(fromCents(3000)).toBe(30);
  });

  it("round-trips without drift", () => {
    expect(fromCents(toCents(45.67))).toBe(45.67);
  });
});
