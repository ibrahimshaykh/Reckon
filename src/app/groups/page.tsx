import Link from "next/link";
import { listMyGroups, listPastGroups } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Reveal } from "@/components/motion/reveal";
import { interpolate } from "@/lib/i18n";

// Formatted with a pinned locale, like every other date in this app — an
// unpinned one caused a real hydration mismatch here once before.
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default async function GroupsPage() {
  const session = await requireSession();
  const [groups, pastGroups, dict] = await Promise.all([
    listMyGroups(),
    listPastGroups(),
    getDictionary(session.locale),
  ]);

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

      {/* Only shown once there's something to show — an empty "groups you've
          left" heading is just clutter on an account that never left one. */}
      {pastGroups.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading>{dict.groupHub.pastGroups}</SectionHeading>
          <ul className="flex flex-col">
            {pastGroups.map((group) => (
              <li
                key={group.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule/60 py-3 last:border-0"
              >
                <span className="font-medium">{group.name}</span>
                {/* Who you shared it with is the reason to keep the entry —
                    "which flat was that?" is a question people ask later. */}
                {group.memberNames.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {interpolate(dict.groupHub.pastGroupWith, {
                      names: group.memberNames.join(", "),
                    })}
                  </span>
                )}
                <span className="tabular ms-auto font-mono text-[0.7rem] text-muted-foreground">
                  {interpolate(dict.groupHub.pastGroupDates, {
                    joined: shortDate(group.joinedAt),
                    left: shortDate(group.leftAt),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
