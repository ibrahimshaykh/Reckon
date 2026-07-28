import { getGroup } from "@/lib/actions/groups";
import { listIOUs } from "@/lib/actions/ious";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
import { AddIOUForm } from "@/components/ious/add-iou-form";
import { IOUList } from "@/components/ious/iou-list";
import { PageHeader } from "@/components/page-header";

export default async function IOUsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [group, ious, session] = await Promise.all([
    getGroup(groupId),
    listIOUs(groupId),
    requireSession(),
  ]);
  const dict = await getDictionary(session.locale);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 md:py-14">
      <PageHeader
        eyebrow={group.name}
        title={dict.ious.title}
        description={dict.ious.helpTip}
      />
      <AddIOUForm
        groupId={groupId}
        members={group.members}
        currentUserId={session.id}
        currency={group.currency}
        dict={dict}
      />
      <IOUList ious={ious} currentUserId={session.id} currency={group.currency} dict={dict} />
    </div>
  );
}
