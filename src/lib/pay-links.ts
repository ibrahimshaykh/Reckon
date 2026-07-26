export type PayProvider = "venmo" | "paypal" | "cashapp";

export function buildPayLink(
  provider: PayProvider,
  input: { handle: string; amountCents: number; note: string },
): string {
  const amount = (input.amountCents / 100).toFixed(2);
  const handle = input.handle.replace(/^[@$]/, "");

  switch (provider) {
    case "venmo":
      return `https://venmo.com/${handle}?txn=pay&amount=${amount}&note=${encodeURIComponent(input.note)}`;
    case "paypal":
      return `https://paypal.me/${handle}/${amount}`;
    case "cashapp":
      return `https://cash.app/$${handle}/${amount}`;
  }
}
