import { describe, it, expect } from "vitest";
import { buildPayLink } from "@/lib/pay-links";

describe("buildPayLink", () => {
  it("builds a Venmo deep link with amount and note", () => {
    const url = buildPayLink("venmo", { handle: "jordan", amountCents: 1500, note: "Rent" });
    expect(url).toBe("https://venmo.com/jordan?txn=pay&amount=15.00&note=Rent");
  });

  it("builds a PayPal.me link", () => {
    const url = buildPayLink("paypal", { handle: "jordan", amountCents: 500, note: "" });
    expect(url).toBe("https://paypal.me/jordan/5.00");
  });

  it("builds a Cash App link", () => {
    const url = buildPayLink("cashapp", { handle: "jordan", amountCents: 250, note: "" });
    expect(url).toBe("https://cash.app/$jordan/2.50");
  });

  it("strips a leading @ or $ from the handle", () => {
    expect(buildPayLink("venmo", { handle: "@jordan", amountCents: 100, note: "" })).toContain(
      "venmo.com/jordan",
    );
    expect(buildPayLink("cashapp", { handle: "$jordan", amountCents: 100, note: "" })).toContain(
      "cash.app/$jordan",
    );
  });
});
