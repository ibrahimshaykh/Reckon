import { getCapabilityPrimer } from "@/lib/actions/ai-query";
import { AskForm } from "@/components/ai-query/ask-form";

export default async function AskPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Ask about this group</h1>
      <AskForm groupId={groupId} primer={getCapabilityPrimer()} />
    </div>
  );
}
