import { getGroupSettlements } from "@/lib/actions/settlements";
import { getGroup } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
import { SettlementList } from "@/components/settlements/settlement-list";

export default async function SettlePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [settlements, session, group] = await Promise.all([
    getGroupSettlements(groupId),
    requireSession(),
    getGroup(groupId),
  ]);
  const dict = await getDictionary(session.locale);

  const open = settlements.filter((s) => s.status !== "CONFIRMED").length;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 md:py-14">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
          {group.name}
        </p>
        <h1 className="text-4xl font-semibold md:text-5xl">{dict.settle.title}</h1>
        <p className="max-w-prose text-[0.9375rem] leading-relaxed text-muted-foreground">
          {dict.settle.helpTip}
        </p>
        {open > 0 && (
          <p className="tabular font-mono text-xs text-muted-foreground">
            {open} {open === 1 ? "payment" : "payments"} left to clear
          </p>
        )}
      </header>
      <SettlementList
        settlements={settlements}
        currentUserId={session.id}
        currency={group.currency}
        dict={dict}
      />
    </div>
  );
}
