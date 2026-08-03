import { listChores, getChoreFairness } from "@/lib/actions/chores";
import { listSwapOffers } from "@/lib/actions/chore-swaps";
import { computeFairnessBars } from "@/lib/chore-fairness";
import { requireGroupAccess } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
import { AddChoreForm } from "@/components/chores/add-chore-form";
import { ChoreList } from "@/components/chores/chore-list";
import { FairnessBars } from "@/components/chores/fairness-bars";
import { PageHeader } from "@/components/page-header";
import { FieldGuide } from "@/components/field-guide";
import { SwapOffers } from "@/components/chores/swap-controls";

export default async function ChoresPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  await requireGroupAccess(groupId);
  const [session, chores, fairness, swapOffers] = await Promise.all([
    requireSession(),
    listChores(groupId),
    getChoreFairness(groupId),
    listSwapOffers(groupId),
  ]);
  const dict = await getDictionary(session.locale);
  const bars = computeFairnessBars(fairness);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 md:py-14">
      <PageHeader
        title={dict.chores.title}
        description={dict.chores.helpTip}
      />
      <FieldGuide guide={dict.guides.chores} dict={dict} />
      <AddChoreForm groupId={groupId} dict={dict} />
      {/* Above the list: an offer waiting on you is the thing to deal with
          first, not something to hunt for among the rows. */}
      <SwapOffers
        offers={swapOffers}
        // Taking an open call means giving something back, so the claim needs
        // to know what this person has to offer.
        mine={chores
          .filter(
            (c) =>
              c.assignmentId && !c.completedAt && c.currentAssigneeId === session.id,
          )
          .map((c) => ({
            assignmentId: c.assignmentId as string,
            choreName: c.name,
            effortWeight: c.effortWeight,
            frequency: c.frequency,
            assigneeName: c.currentAssignee as string,
          }))}
        dict={dict}
      />
      <FairnessBars bars={bars} title={dict.chores.fairnessTitle} />
      <ChoreList
        groupId={groupId}
        chores={chores}
        currentUserId={session.id}
        dict={dict}
      />
    </div>
  );
}
