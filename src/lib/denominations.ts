// Quick-pick amounts for an IOU, drawn from notes that actually exist.
//
// These were hard-coded at 5 / 10 / 20, which is fine if you're carrying
// dollars and nonsense if you're not: nobody in Pakistan lends someone a
// 5-rupee note, because there hasn't been one in years. An IOU is almost
// always "I handed you a note", so the shortcuts should be the notes you'd
// actually hand over.
//
// Three per currency, chosen around what a friend lends a friend — big enough
// to be worth writing down, small enough to be common in a wallet.

const NOTES: Record<string, [number, number, number]> = {
  PKR: [100, 500, 1000],
  USD: [5, 10, 20],
  INR: [100, 200, 500],
  AED: [20, 50, 100],
  GBP: [5, 10, 20],
  EUR: [5, 10, 20],
  CAD: [5, 10, 20],
  AUD: [5, 10, 20],
  SAR: [10, 50, 100],
  BDT: [100, 500, 1000],
  CNY: [10, 20, 50],
  // No 100-yen note — the smallest is 1000, and coins go up to 500.
  JPY: [1000, 5000, 10000],
  KRW: [5000, 10000, 50000],
  SGD: [5, 10, 50],
  MYR: [10, 20, 50],
  ZAR: [20, 50, 100],
  NGN: [200, 500, 1000],
  EGP: [20, 50, 100],
  TRY: [20, 50, 100],
  PHP: [100, 200, 500],
  IDR: [10000, 50000, 100000],
  THB: [100, 500, 1000],
  VND: [20000, 50000, 100000],
  MXN: [50, 100, 200],
  BRL: [10, 20, 50],
  CHF: [10, 20, 50],
  SEK: [50, 100, 200],
  NZD: [5, 10, 20],
  QAR: [10, 50, 100],
  // Kuwait's dinar is worth roughly three dollars, so the notes stay small.
  KWD: [1, 5, 10],
};

// Only reached if a currency is added to CURRENCIES without a note set here,
// which a test guards against. Dollar-like values are the least surprising
// thing to fall back to.
const FALLBACK: [number, number, number] = [5, 10, 20];

/**
 * Returns three sensible amounts in minor units (the same hundredths the rest
 * of the app counts in), so they can be handed straight to toCents/formatMoney.
 */
export function quickAmountsFor(currencyCode: string): number[] {
  return (NOTES[currencyCode] ?? FALLBACK).map((note) => note * 100);
}

/**
 * Whether this currency has notes of its own rather than borrowing the
 * fallback. Exists so a test can tell "deliberately 5/10/20" apart from
 * "nobody filled this in" — several currencies genuinely are 5/10/20, so
 * comparing the returned values can't distinguish the two.
 */
export function hasNotesFor(currencyCode: string): boolean {
  return currencyCode in NOTES;
}
