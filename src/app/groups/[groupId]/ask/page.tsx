import { AskForm } from "@/components/ai-query/ask-form";
import { PageHeader } from "@/components/page-header";
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 md:py-14">
      <PageHeader
        title={dict.ask.title}
        description={dict.ask.helpTip}
      />
      <AskForm groupId={groupId} dict={dict} />
    </div>
  );
}
