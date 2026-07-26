import { getGroupSettlements } from "@/lib/actions/settlements";
import { requireSession } from "@/lib/dal";
import { SettlementList } from "@/components/settlements/settlement-list";

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
      <SettlementList settlements={settlements} currentUserId={session.id} />
    </div>
  );
}
