import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { TextReveal } from "@/components/motion/text-reveal";
import { CountUp } from "@/components/motion/count-up";
import { SettleDemo } from "@/components/landing/settle-demo";

// Each pillar is labelled by what it actually computes — the label carries
// real information about the feature rather than decorating it with a number.
const PILLARS = [
  {
    tone: "var(--primary)",
    computes: "the fewest transfers",
    title: "Money",
    body: "Shared bills, one-off costs and quick IOUs all feed one balance. Reckon works out the smallest set of payments that clears everyone, then hands off to whatever you already pay with — EasyPaisa, JazzCash, a bank transfer, or a card.",
  },
  {
    tone: "var(--warm)",
    computes: "effort-weighted rotation",
    title: "Chores",
    body: "Jobs are weighted by how much they actually take, so the rota can't quietly park the worst ones on the same person every week. Mark something done and the next turn moves on.",
  },
  {
    tone: "var(--positive)",
    computes: "the real overlap",
    title: "Plans",
    body: "Everyone marks when they're free and Reckon finds the windows that genuinely work for the group. Proposals get checked against each person's own budget and dietary limits — it flags the conflicts and leaves the choosing to you.",
  },
];

export function Landing() {
  return (
    <div className="flex flex-col">
      <section className="relative isolate overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 md:py-28 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
        <div className="flex flex-col gap-6">
          <p className="w-fit rounded-full border border-warm/30 bg-warm-surface px-3 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-warm">
            For people who share a roof
          </p>
          <h1 className="text-5xl font-semibold leading-[0.95] md:text-6xl lg:text-7xl">
            <TextReveal text="Five debts." delay={0.05} />
            <br />
            <TextReveal text="Two payments." accentFrom={0} delay={0.2} />
          </h1>
          <p className="max-w-prose text-lg leading-relaxed text-muted-foreground">
            Reckon works out the fewest transfers that settle everyone, then
            shows you exactly how it got there. Same for the chore rota and the
            plans nobody can agree on.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button render={<Link href="/sign-up" />} nativeButton={false} size="lg">
              Start a group
            </Button>
            <Button
              render={<Link href="/sign-in" />}
              nativeButton={false}
              variant="ghost"
              size="lg"
            >
              Sign in
            </Button>
          </div>
        </div>
        <SettleDemo />
        </div>
      </section>

      <section className="border-y border-rule bg-card/60">
        <dl className="mx-auto grid w-full max-w-6xl gap-px bg-rule sm:grid-cols-3">
          {[
            { value: 60, suffix: "s", label: "to set a group up", tone: "var(--primary)" },
            { value: 4, suffix: "", label: "ways to pay, all yours already", tone: "var(--warm)" },
            { value: 0, suffix: "", label: "accounts needed to see what you owe", tone: "var(--positive)" },
          ].map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.08}>
              <div className="flex h-full flex-col gap-1 bg-card p-6 sm:p-8">
                <dt className="sr-only">{stat.label}</dt>
                <dd
                  className="font-heading text-5xl font-semibold"
                  style={{ color: stat.tone }}
                >
                  <CountUp to={stat.value} suffix={stat.suffix} />
                </dd>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </Reveal>
          ))}
        </dl>
      </section>

      <section className="border-b border-rule bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-20 md:py-24 lg:flex-row lg:gap-16">
          <Reveal className="lg:w-[38%]">
            <h2 className="text-3xl font-semibold md:text-4xl">
              Every number shows its working
            </h2>
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted-foreground">
              A split nobody understands is a split nobody trusts. Open any
              figure in Reckon and the steps that produced it are right there.
            </p>
          </Reveal>
          <Reveal delay={0.1} className="lg:flex-1">
            <div className="ledger-panel rounded-r-lg p-5">
              <p className="tabular text-sm font-semibold">Ayesha owes Bilal Rs 1,050</p>
              <ul className="mt-3 flex flex-col gap-2 border-t border-rule pt-3">
                <li className="ledger-step tabular text-xs leading-relaxed">
                  Ayesha owes Rs 1,200 total.
                </li>
                <li className="ledger-step tabular text-xs leading-relaxed">
                  Sana owes Ayesha Rs 750, netted off first.
                </li>
                <li className="ledger-step tabular text-xs leading-relaxed">
                  Matched the largest debtor against the largest creditor for Rs 1,050.
                </li>
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
        <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-rule bg-rule">
          {PILLARS.map((pillar, i) => (
            <Reveal key={pillar.title} delay={i * 0.08}>
              <article className="flex flex-col gap-3 bg-background p-6 sm:flex-row sm:gap-10 sm:p-8">
                <div className="sm:w-56 sm:shrink-0">
                  <h3 className="font-heading text-2xl font-semibold">{pillar.title}</h3>
                  <p
                    className="mt-1 font-mono text-[0.6875rem] uppercase tracking-[0.14em]"
                    style={{ color: pillar.tone }}
                  >
                    Computes {pillar.computes}
                  </p>
                </div>
                <p className="max-w-prose text-[0.9375rem] leading-relaxed text-muted-foreground">
                  {pillar.body}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="relative isolate overflow-hidden border-t border-rule">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_80%_120%,var(--accent),transparent_60%),radial-gradient(50rem_28rem_at_10%_110%,var(--warm-surface),transparent_65%)]"
        />
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-6 py-20 md:py-24">
          <h2 className="max-w-2xl text-3xl font-semibold md:text-4xl">
            Stop keeping score in your head
          </h2>
          <p className="max-w-prose text-[0.9375rem] leading-relaxed text-muted-foreground">
            Make a group, add the first expense, and send the link. The people
            you live with don&apos;t need an account to see what they owe.
          </p>
          <Button render={<Link href="/sign-up" />} nativeButton={false} size="lg">
            Start a group
          </Button>
        </div>
      </section>
    </div>
  );
}
