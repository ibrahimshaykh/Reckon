import Link from "next/link";
import { Pencil } from "lucide-react";
import { getGroup } from "@/lib/actions/groups";
import { listGroupExpenses } from "@/lib/actions/expenses";
import { formatMoney } from "@/lib/money";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
import { AddMemberForm } from "@/components/groups/add-member-form";
import { ShareExpenseButton } from "@/components/expenses/share-expense-button";
import { DeleteExpenseButton } from "@/components/expenses/delete-expense-button";
import { CurrencyPicker } from "@/components/groups/currency-picker";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Reveal } from "@/components/motion/reveal";
import { StickmanParade } from "@/components/sketch/sketch-ui";
import { Shavings, Thumbtacked } from "@/components/sketch/scribble";
import { summariseExpense, joinNames } from "@/lib/expense-summary";
import type { Dictionary } from "@/lib/dictionary";

// Turns an expense into the sentence a person would actually say about it.
// Falls back to the bare "Paid by X" line when there are no participants to
// describe, so a malformed or legacy row still says something useful.
function describeExpense(
  expense: {
    paidById: string;
    paidByName: string;
    participants: { id: string; name: string }[];
  },
  dict: Dictionary,
) {
  const summary = summariseExpense(
    expense.paidById,
    expense.paidByName,
    expense.participants,
  );
  const and = dict.common.and;

  switch (summary.kind) {
    case "sharedBy":
      return interpolate(dict.groupHub.sharedBy, { names: joinNames(summary.names, and) });
    case "boughtFor":
      return interpolate(dict.groupHub.boughtFor, {
        payer: summary.payer,
        names: joinNames(summary.names, and),
      });
    case "paidForSelf":
      return interpolate(dict.groupHub.paidForSelf, { payer: summary.payer });
    default:
      return `${dict.common.paidBy} ${expense.paidByName}`;
  }
}

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [session, group, expenses] = await Promise.all([
    requireSession(),
    getGroup(groupId),
    listGroupExpenses(groupId),
  ]);
  const dict = await getDictionary(session.locale);

  const total = expenses.reduce((sum, e) => sum + e.totalAmount, 0);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 md:py-14">
      <PageHeader
        eyebrow={
          group.members.length === 1
            ? dict.groupHub.memberCountOne
            : interpolate(dict.groupHub.memberCountMany, {
                count: String(group.members.length),
              })
        }
        title={group.name}
        meta={
          expenses.length > 0 ? (
            <p className="tabular font-mono text-xs text-muted-foreground">
              {expenses.length === 1
                ? interpolate(dict.groupHub.trackedOne, {
                    amount: formatMoney(total * 100, group.currency),
                  })
                : interpolate(dict.groupHub.trackedMany, {
                    amount: formatMoney(total * 100, group.currency),
                    count: String(expenses.length),
                  })}
            </p>
          ) : undefined
        }
        action={
          <CurrencyPicker groupId={group.id} currency={group.currency} dict={dict} />
        }
      />
      <section className="flex flex-col gap-3">
        <SectionHeading>{dict.groupHub.members}</SectionHeading>
        <ul className="flex flex-col">
          {group.members.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-baseline gap-x-2 border-b border-rule/60 py-2 last:border-0"
            >
              <Link
                href={`/friends/${m.id}`}
                className="text-sm font-medium underline-offset-4 transition-colors hover:text-primary hover:underline"
              >
                {m.displayName}
              </Link>
              <span className="font-mono text-xs text-muted-foreground">{m.email}</span>
            </li>
          ))}
        </ul>
        <AddMemberForm groupId={group.id} dict={dict} />
      </section>
      <StickmanParade />
      <nav className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-3 sketch:gap-3 sketch:border-0 sketch:bg-transparent">
        {[
          { href: "chores", label: dict.groupHub.chores, tone: "var(--feature-chores)" },
          { href: "availability", label: dict.groupHub.availability, tone: "var(--feature-availability)" },
          { href: "ious", label: dict.groupHub.ious, tone: "var(--feature-ious)" },
          { href: "proposals", label: dict.groupHub.proposals, tone: "var(--feature-proposals)" },
          { href: "ask", label: dict.groupHub.askAi, tone: "var(--feature-ask)" },
          { href: "recap", label: dict.groupHub.monthlyRecap, tone: "var(--feature-recap)" },
        ].map((item) => (
          <Thumbtacked key={item.href} tilt={4}>
            <Shavings className="w-full">
              <Link
                href={`/groups/${group.id}/${item.href}`}
                style={{ "--tone": item.tone } as React.CSSProperties}
                className="group/nav relative flex w-full items-center gap-3 bg-card px-4 py-3.5 text-sm font-medium transition-colors before:absolute before:inset-y-0 before:start-0 before:w-[3px] before:bg-[var(--tone)] before:opacity-60 before:transition-opacity hover:bg-[color-mix(in_oklab,var(--tone)_12%,var(--card))] hover:before:opacity-100 sketch:sketch-box sketch:sketch-press sketch:border-[var(--tone)] sketch:before:hidden"
              >
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full bg-[var(--tone)]"
                />
                <span>{item.label}</span>
                <span
                  aria-hidden
                  className="ml-auto font-mono text-[var(--tone)] transition-transform group-hover/nav:translate-x-0.5"
                >
                  →
                </span>
              </Link>
            </Shavings>
          </Thumbtacked>
        ))}
      </nav>
      <section className="flex flex-col gap-3">
        <SectionHeading
          action={
            <div className="flex gap-2">
              <Button
                render={<Link href={`/groups/${group.id}/expenses/new`} />}
                nativeButton={false}
                size="sm"
              >
                {dict.groupHub.addExpense}
              </Button>
              <Button
                render={<Link href={`/groups/${group.id}/settle`} />}
                nativeButton={false}
                variant="outline"
                size="sm"
              >
                {dict.groupHub.whoOwesWho}
              </Button>
            </div>
          }
        >
          {dict.groupHub.expenses}
        </SectionHeading>
        {expenses.length === 0 ? (
          <div className="ledger-panel rounded-r-lg px-5 py-8 text-center">
            <p className="text-sm text-ledger-foreground">{dict.groupHub.noExpensesYet}</p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {expenses.map((e, i) => (
              <Reveal key={e.id} delay={Math.min(i, 6) * 0.04}>
                <li className="flex items-baseline gap-4 border-b border-rule/60 py-3 last:border-0">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{e.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {describeExpense(e, dict)}
                    </span>
                  </div>
                  <span className="tabular ml-auto shrink-0 text-sm font-semibold">
                    {formatMoney(e.totalAmount * 100, group.currency)}
                  </span>
                  <ShareExpenseButton expenseId={e.id} expenseTitle={e.title} dict={dict} />
                  {e.paidById === session.id && (
                    <>
                      <Link
                        href={`/groups/${group.id}/expenses/${e.id}/edit`}
                        aria-label={dict.expenses.editTitle}
                        title={dict.expenses.editExpense}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                      >
                        <Pencil className="size-3.5" />
                      </Link>
                      <DeleteExpenseButton expenseId={e.id} title={e.title} dict={dict} />
                    </>
                  )}
                </li>
              </Reveal>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
