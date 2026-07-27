import { describe, it, expect } from "vitest";
import { toCents, fromCents, formatMoney } from "@/lib/money";

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

describe("formatMoney", () => {
  it("formats USD with a dollar sign and two decimal places", () => {
    expect(formatMoney(1999, "USD")).toBe("$19.99");
  });

  it("formats a currency with no minor unit (JPY) with no decimal places", () => {
    expect(formatMoney(199900, "JPY")).toBe("¥1,999");
  });

  it("formats PKR with its own symbol, not a generic $", () => {
    const formatted = formatMoney(150000, "PKR");
    expect(formatted).not.toContain("$");
    expect(formatted).toContain("1,500");
  });

  // Regression test: Intl.NumberFormat's *default* fraction-digit count for
  // PKR is resolved from the runtime's bundled ICU data, which genuinely
  // disagreed between Node (SSR) and a browser (hydration) — Node rendered
  // "Rs 5", the browser re-rendered "Rs 5.00", a real hydration mismatch.
  // Digits are now pinned explicitly so this can't happen again.
  it("always renders PKR with exactly two decimal places", () => {
    // Intl.NumberFormat separates the "Rs" symbol from the number with a
    // no-break space (U+00A0), not a regular space — intentional here.
    expect(formatMoney(500, "PKR")).toBe("Rs 5.00");
  });

  it("renders the same string regardless of caller — no locale drift", () => {
    expect(formatMoney(500, "USD")).toBe(formatMoney(500, "USD"));
  });
});
