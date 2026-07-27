"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateUserLocale } from "@/lib/actions/profile";
import { LOCALES, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  ur: "اردو",
  es: "Español",
};

export function LanguagePicker({ locale, label }: { locale: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSelect(next: Locale) {
    if (next === locale) return;
    setPending(true);
    await updateUserLocale(next);
    setPending(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-muted-foreground">{label}</label>
      <div className="flex gap-1.5">
        {LOCALES.map((code) => (
          <Button
            key={code}
            type="button"
            size="sm"
            variant={locale === code ? "secondary" : "outline"}
            disabled={pending}
            onClick={() => onSelect(code)}
          >
            {LOCALE_LABEL[code]}
          </Button>
        ))}
      </div>
    </div>
  );
}
