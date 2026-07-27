// Locale constants and types only — safe to import from Client Components.
// Dictionary loading (which needs "server-only") lives in
// src/lib/dictionary.ts to keep that guard from pulling this whole module
// into the client bundle.
export const LOCALES = ["en", "ur", "es"] as const;
export type Locale = (typeof LOCALES)[number];

const RTL_LOCALES: readonly Locale[] = ["ur"];

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function isRtl(locale: string): boolean {
  return isLocale(locale) && RTL_LOCALES.includes(locale);
}
