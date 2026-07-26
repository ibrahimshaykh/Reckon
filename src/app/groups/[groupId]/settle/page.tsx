import { getGroupSettlements } from "@/lib/actions/settlements";
import { requireSession } from "@/lib/dal";
import { SettlementList } from "@/components/settlements/settlement-list";
import { HelpTip } from "@/components/help-tip";

export default async function SettlePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [settlements, session] = await Promise.all([
    getGroupSettlements(groupId),
    requireSession(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Who owes who</h1>
      <HelpTip text="This is the fewest payments needed to clear every debt — expand a row to see the math." />
      <SettlementList settlements={settlements} currentUserId={session.id} />
    </div>
  );
}
