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

// Fills a dictionary template like "{name} owes {amount}" from a plain
// object — deliberately not a full ICU MessageFormat (no pluralization
// rules, no gender), since every plural case in this app's dictionaries is
// already split into explicit *One/*Many keys picked by the caller instead.
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
