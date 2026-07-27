import { Prisma } from "@/generated/prisma/client";

export function toCents(amount: Prisma.Decimal | number): number {
  const value = typeof amount === "number" ? amount : Number(amount);
  return Math.round(value * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

// Currencies whose conventional display has no minor unit. Intl.NumberFormat
// can normally infer this from the currency code alone, but its *default*
// digit count is resolved from the runtime's bundled ICU/CLDR data, which is
// NOT guaranteed to agree between Node (SSR) and a browser (hydration) — this
// caused a real hydration mismatch for PKR specifically (server said "Rs 5",
// client said "Rs 5.00"). Every currency's digit count is pinned explicitly
// below so the output is identical regardless of which runtime formats it.
const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "VND"]);

// Locale is pinned too (not the runtime default) — an unpinned locale caused
// a separate, earlier hydration mismatch elsewhere in this app (server and
// browser default locales differed).
export function formatMoney(amountCents: number, currencyCode: string): string {
  const digits = ZERO_DECIMAL_CURRENCIES.has(currencyCode) ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amountCents / 100);
}
