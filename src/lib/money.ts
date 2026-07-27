import { Prisma } from "@/generated/prisma/client";

export function toCents(amount: Prisma.Decimal | number): number {
  const value = typeof amount === "number" ? amount : Number(amount);
  return Math.round(value * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

// Locale is pinned (not the runtime default) so this renders identically on
// the server and the client — an unpinned locale caused a real hydration
// mismatch elsewhere in this app (server/browser default locales differed).
// Intl.NumberFormat itself still handles per-currency display conventions
// (symbol placement, thousands separators, decimal places) from the
// currency code alone — dividing by 100 to recover major units is always
// correct here since toCents/fromCents scale by exactly 100 on the way in
// too; a zero-decimal currency like JPY just rounds the display to whole
// units, which is the correct behavior for that currency, not a bug.
export function formatMoney(amountCents: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    currencyDisplay: "narrowSymbol",
  }).format(amountCents / 100);
}
