import Link from "next/link";
import { listMyGroups } from "@/lib/actions/groups";
import { Button } from "@/components/ui/button";

export default async function GroupsPage() {
  const groups = await listMyGroups();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your groups</h1>
        <Button render={<Link href="/groups/new" />} nativeButton={false}>
          New group
        </Button>
      </div>
      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No groups yet — create one to start splitting expenses.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {groups.map((group) => (
          <li key={group.id}>
            <Link
              href={`/groups/${group.id}`}
              className="block rounded-lg border p-3 hover:bg-muted"
            >
              {group.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
