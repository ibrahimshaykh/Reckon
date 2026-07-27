import { AskForm } from "@/components/ai-query/ask-form";
import { HelpTip } from "@/components/help-tip";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";

export default async function AskPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const session = await requireSession();
  const dict = await getDictionary(session.locale);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">{dict.ask.title}</h1>
      <HelpTip text={dict.ask.helpTip} />
      <AskForm groupId={groupId} dict={dict} />
    </div>
  );
}
