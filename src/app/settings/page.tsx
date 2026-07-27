import { requireSession } from "@/lib/dal";
import { toCents } from "@/lib/money";
import { getDictionary } from "@/lib/dictionary";
import { ProfileForm } from "@/components/settings/profile-form";
import { LanguagePicker } from "@/components/settings/language-picker";

export default async function SettingsPage() {
  const session = await requireSession();
  const dict = await getDictionary(session.locale);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">{dict.settings.title}</h1>
      <LanguagePicker locale={session.locale} label={dict.settings.language} />
      <ProfileForm
        dict={dict.settings}
        initialBudgetLimit={
          session.budgetLimit === null ? null : toCents(session.budgetLimit)
        }
        initialDietaryRestrictions={session.dietaryRestrictions}
        initialHomeLatitude={session.homeLatitude}
        initialHomeLongitude={session.homeLongitude}
        initialVenmoHandle={session.venmoHandle ?? ""}
        initialPaypalHandle={session.paypalHandle ?? ""}
        initialCashappHandle={session.cashappHandle ?? ""}
        initialEasypaisaNumber={session.easypaisaNumber ?? ""}
        initialJazzcashNumber={session.jazzcashNumber ?? ""}
        initialNayapayHandle={session.nayapayHandle ?? ""}
        initialBankDetails={session.bankDetails ?? ""}
      />
    </div>
  );
}
