import { requireSession } from "@/lib/dal";
import { toCents } from "@/lib/money";
import { ProfileForm } from "@/components/settings/profile-form";

export default async function SettingsPage() {
  const session = await requireSession();

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <ProfileForm
        initialBudgetLimit={
          session.budgetLimit === null ? null : toCents(session.budgetLimit)
        }
        initialDietaryRestrictions={session.dietaryRestrictions}
        initialHomeLatitude={session.homeLatitude}
        initialHomeLongitude={session.homeLongitude}
        initialVenmoHandle={session.venmoHandle ?? ""}
        initialPaypalHandle={session.paypalHandle ?? ""}
        initialCashappHandle={session.cashappHandle ?? ""}
      />
    </div>
  );
}
