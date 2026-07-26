import { getGroup } from "@/lib/actions/groups";
import { AddMemberForm } from "@/components/groups/add-member-form";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const group = await getGroup(groupId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{group.name}</h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Members</h2>
        <ul className="flex flex-col gap-1">
          {group.members.map((m) => (
            <li key={m.id} className="text-sm">
              {m.displayName} ({m.email})
            </li>
          ))}
        </ul>
        <AddMemberForm groupId={group.id} />
      </section>
    </div>
  );
}
