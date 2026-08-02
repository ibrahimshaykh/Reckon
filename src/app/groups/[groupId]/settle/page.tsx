import { getGroupSettlements } from "@/lib/actions/settlements";
import { getGroup , requireGroupAccess } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
import { SettlementList } from "@/components/settlements/settlement-list";
import { PageHeader } from "@/components/page-header";
import { interpolate } from "@/lib/i18n";

export default async function SettlePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  await requireGroupAccess(groupId);
  const [settlements, session, group] = await Promise.all([
    getGroupSettlements(groupId),
    requireSession(),
    getGroup(groupId),
  ]);
  const dict = await getDictionary(session.locale);

  const open = settlements.filter((s) => s.status !== "CONFIRMED").length;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 md:py-14">
      <PageHeader
        eyebrow={group.name}
        title={dict.settle.title}
        description={dict.settle.helpTip}
        meta={
          open > 0 ? (
            <p className="tabular font-mono text-xs text-muted-foreground">
              {open === 1
                ? dict.settle.remainingOne
                : interpolate(dict.settle.remainingMany, { count: String(open) })}
            </p>
          ) : undefined
        }
      />
      <SettlementList
        settlements={settlements}
        currentUserId={session.id}
        currency={group.currency}
        dict={dict}
      />
    </div>
  );
}
