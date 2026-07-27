import "server-only";
import type enDictionary from "@/dictionaries/en.json";
import { isLocale, type Locale } from "@/lib/i18n";

export type Dictionary = typeof enDictionary;

const loaders: Record<Locale, () => Promise<Dictionary>> = {
  en: () => import("@/dictionaries/en.json").then((m) => m.default),
  ur: () => import("@/dictionaries/ur.json").then((m) => m.default),
  es: () => import("@/dictionaries/es.json").then((m) => m.default),
};

// Falls back to English for a stored value that's no longer a supported
// locale (e.g. after a language is ever removed) rather than throwing.
export async function getDictionary(locale: string): Promise<Dictionary> {
  const safeLocale = isLocale(locale) ? locale : "en";
  return loaders[safeLocale]();
}
