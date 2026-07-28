import Link from "next/link";
import { listMyGroups } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Reveal } from "@/components/motion/reveal";

export default async function GroupsPage() {
  const session = await requireSession();
  const [groups, dict] = await Promise.all([listMyGroups(), getDictionary(session.locale)]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 md:py-14">
      <PageHeader
        title={dict.groupHub.yourGroups}
        action={
          <Button render={<Link href="/groups/new" />} nativeButton={false}>
            {dict.groupHub.newGroup}
          </Button>
        }
      />
      {groups.length === 0 ? (
        <div className="ledger-panel rounded-r-lg px-5 py-8 text-center">
          <p className="text-sm text-ledger-foreground">{dict.groupHub.noGroupsYet}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((group, i) => (
            <Reveal key={group.id} delay={Math.min(i, 6) * 0.05}>
              <li>
                <Link
                  href={`/groups/${group.id}`}
                  className="group/row flex items-center justify-between gap-4 rounded-lg border border-rule bg-card px-4 py-4 transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <span className="font-heading text-lg font-semibold tracking-[-0.01em]">
                    {group.name}
                  </span>
                  <span
                    aria-hidden
                    className="font-mono text-muted-foreground transition-transform group-hover/row:translate-x-0.5 group-hover/row:text-primary"
                  >
                    →
                  </span>
                </Link>
              </li>
            </Reveal>
          ))}
        </ul>
      )}
    </div>
  );
}
