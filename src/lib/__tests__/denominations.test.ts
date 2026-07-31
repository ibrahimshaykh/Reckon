import { describe, it, expect } from "vitest";
import { quickAmountsFor, hasNotesFor } from "@/lib/denominations";
import { CURRENCIES } from "@/lib/currencies";
import { formatMoney } from "@/lib/money";

// Intl puts a non-breaking space between symbol and number, which is correct
// but makes assertions look identical to a failing one.
const shown = (code: string) =>
  quickAmountsFor(code).map((a) => formatMoney(a, code).replace(/ /g, " "));

describe("quickAmountsFor", () => {
  it("offers real Pakistani notes, not the dollar amounts it used to", () => {
    expect(quickAmountsFor("PKR")).toEqual([10000, 50000, 100000]);
    expect(shown("PKR")).toEqual(["Rs 100.00", "Rs 500.00", "Rs 1,000.00"]);
  });

  it("keeps dollars as dollars", () => {
    expect(shown("USD")).toEqual(["$5.00", "$10.00", "$20.00"]);
  });

  it("starts yen at 1,000, since there is no smaller note", () => {
    expect(shown("JPY")).toEqual(["¥1,000", "¥5,000", "¥10,000"]);
  });

  // A currency in the picker with no notes defined would silently hand
  // Indonesians a 5-rupiah button, which buys nothing at all. Checked by
  // membership rather than by value — several currencies really are 5/10/20,
  // so comparing amounts can't tell a choice from an omission.
  it("covers every currency the picker offers", () => {
    const missing = CURRENCIES.filter((c) => !hasNotesFor(c.code)).map((c) => c.code);

    expect(missing).toEqual([]);
  });

  it("always gives three amounts, ascending, all positive", () => {
    for (const { code } of CURRENCIES) {
      const amounts = quickAmountsFor(code);

      expect(amounts, code).toHaveLength(3);
      expect(amounts[0], code).toBeGreaterThan(0);
      expect(amounts[0], code).toBeLessThan(amounts[1]);
      expect(amounts[1], code).toBeLessThan(amounts[2]);
    }
  });

  it("gives whole notes — nothing with stray pennies in it", () => {
    for (const { code } of CURRENCIES) {
      for (const amount of quickAmountsFor(code)) {
        expect(amount % 100, `${code} ${amount}`).toBe(0);
      }
    }
  });

  it("falls back rather than breaking on a currency it doesn't know", () => {
    expect(quickAmountsFor("XYZ")).toEqual([500, 1000, 2000]);
  });
});
