export type Currency = { code: string; name: string; flag: string };

// A curated set rather than the full ISO-4217 list (~180 codes) — covers
// what a roommate/friend-group app's users are actually likely to need.
export const CURRENCIES: Currency[] = [
  { code: "PKR", name: "Pakistani Rupee", flag: "🇵🇰" },
  { code: "USD", name: "US Dollar", flag: "🇺🇸" },
  { code: "INR", name: "Indian Rupee", flag: "🇮🇳" },
  { code: "AED", name: "UAE Dirham", flag: "🇦🇪" },
  { code: "GBP", name: "British Pound", flag: "🇬🇧" },
  { code: "EUR", name: "Euro", flag: "🇪🇺" },
  { code: "CAD", name: "Canadian Dollar", flag: "🇨🇦" },
  { code: "AUD", name: "Australian Dollar", flag: "🇦🇺" },
  { code: "SAR", name: "Saudi Riyal", flag: "🇸🇦" },
  { code: "BDT", name: "Bangladeshi Taka", flag: "🇧🇩" },
  { code: "CNY", name: "Chinese Yuan", flag: "🇨🇳" },
  { code: "JPY", name: "Japanese Yen", flag: "🇯🇵" },
  { code: "KRW", name: "South Korean Won", flag: "🇰🇷" },
  { code: "SGD", name: "Singapore Dollar", flag: "🇸🇬" },
  { code: "MYR", name: "Malaysian Ringgit", flag: "🇲🇾" },
  { code: "ZAR", name: "South African Rand", flag: "🇿🇦" },
  { code: "NGN", name: "Nigerian Naira", flag: "🇳🇬" },
  { code: "EGP", name: "Egyptian Pound", flag: "🇪🇬" },
  { code: "TRY", name: "Turkish Lira", flag: "🇹🇷" },
  { code: "PHP", name: "Philippine Peso", flag: "🇵🇭" },
  { code: "IDR", name: "Indonesian Rupiah", flag: "🇮🇩" },
  { code: "THB", name: "Thai Baht", flag: "🇹🇭" },
  { code: "VND", name: "Vietnamese Dong", flag: "🇻🇳" },
  { code: "MXN", name: "Mexican Peso", flag: "🇲🇽" },
  { code: "BRL", name: "Brazilian Real", flag: "🇧🇷" },
  { code: "CHF", name: "Swiss Franc", flag: "🇨🇭" },
  { code: "SEK", name: "Swedish Krona", flag: "🇸🇪" },
  { code: "NZD", name: "New Zealand Dollar", flag: "🇳🇿" },
  { code: "QAR", name: "Qatari Riyal", flag: "🇶🇦" },
  { code: "KWD", name: "Kuwaiti Dinar", flag: "🇰🇼" },
];

export const COMMON_CURRENCY_CODES = ["PKR", "USD", "INR", "AED", "GBP", "EUR"];

export function findCurrency(code: string): Currency | undefined {
  return CURRENCIES.find((c) => c.code === code);
}
