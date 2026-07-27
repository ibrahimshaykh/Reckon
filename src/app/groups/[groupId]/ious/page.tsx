import { getGroup } from "@/lib/actions/groups";
import { listIOUs } from "@/lib/actions/ious";
import { requireSession } from "@/lib/dal";
import { AddIOUForm } from "@/components/ious/add-iou-form";
import { IOUList } from "@/components/ious/iou-list";
import { HelpTip } from "@/components/help-tip";

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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">IOUs</h1>
      <HelpTip text="For debts outside any shared expense — they fold into the same settle-up total." />
      <AddIOUForm
        groupId={groupId}
        members={group.members}
        currentUserId={session.id}
        currency={group.currency}
      />
      <IOUList ious={ious} currentUserId={session.id} currency={group.currency} />
    </div>
  );
}
