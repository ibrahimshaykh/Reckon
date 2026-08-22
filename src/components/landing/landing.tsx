import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { TextReveal } from "@/components/motion/text-reveal";
import { CountUp } from "@/components/motion/count-up";
import { SettleDemo } from "@/components/landing/settle-demo";
import { MarginNote, ScrawlArrow } from "@/components/landing/margin-note";
import { InsideStrip } from "@/components/landing/inside-strip";
import { LedgerWorking } from "@/components/landing/ledger-working";

// Each pillar carries the feature colour that area actually uses inside the
// app, so the page teaches the colour language before anybody signs in.
const PILLARS = [
  {
    tone: "var(--feature-money)",
    computes: "the fewest transfers",
    title: "Money",
    tilt: "-1.2deg",
    body: "Shared bills, one-off costs and quick IOUs all feed one balance. Reckon works out the smallest set of payments that clears everyone, then hands off to whatever you already pay with — EasyPaisa, JazzCash, a bank transfer, or a card.",
  },
  {
    tone: "var(--feature-chores)",
    computes: "effort-weighted rotation",
    title: "Chores",
    tilt: "0.8deg",
    body: "Jobs are weighted by how much they actually take, so the rota cannot quietly park the worst ones on the same person every week. Let a turn lapse and the credit goes with it — which moves you up the queue, not down it.",
  },
  {
    tone: "var(--feature-proposals)",
    computes: "the real overlap",
    title: "Plans",
    tilt: "-0.6deg",
    body: "Everyone marks when they are free and Reckon finds the windows that genuinely work. Proposals get checked against each person's own budget and dietary limits — it flags the conflicts and leaves the choosing to you.",
  },
];

export function Landing() {
  return (
    <div className="flex flex-col">
      {/* ── Hero ──────────────────────────────────────────────────────────
          The thesis, in the product's own handwriting. The demo beside it is
          not an illustration of the headline — it performs it, collapsing
          five tangled debts into two payments as the reader scrolls. */}
      <section className="relative isolate">
        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 md:py-28 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
          <div className="relative flex flex-col gap-6">
            <p className="sketch-pill w-fit bg-card px-3 py-1 font-mono text-[0.6875rem] tracking-[0.18em] uppercase">
              For people who share a roof
            </p>

            <h1 className="text-6xl leading-[0.92] md:text-7xl lg:text-8xl">
              <TextReveal text="Five debts." delay={0.05} />
              <br />
              <TextReveal text="Two payments." accentFrom={0} delay={0.2} />
            </h1>

            <p className="max-w-prose text-lg leading-relaxed text-muted-foreground">
              Reckon works out the fewest transfers that settle everyone, then
              shows you exactly how it got there. Same for the chore rota and
              the plans nobody can agree on.
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

            <MarginNote side="start" tilt={-4} className="top-28">
              <span className="block">the whole idea,</span>
              <span className="block">in four words</span>
              <ScrawlArrow className="mt-1 ms-auto" />
            </MarginNote>
          </div>

          <SettleDemo />
        </div>
      </section>

      {/* ── The claim, in figures ────────────────────────────────────────── */}
      <section className="border-y border-rule">
        <dl className="mx-auto grid w-full max-w-6xl sm:grid-cols-3">
          {[
            {
              value: 60,
              suffix: "s",
              label: "to set a group up",
              tone: "var(--feature-money)",
            },
            {
              value: 7,
              suffix: "",
              label: "ways to pay, all ones you already use",
              tone: "var(--feature-chores)",
            },
            {
              value: 0,
              suffix: "",
              label: "accounts needed to see what you owe",
              tone: "var(--feature-ious)",
            },
          ].map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.08}>
              <div className="flex h-full flex-col gap-1 border-rule p-6 sm:p-8 sm:not-last:border-e">
                <dt className="sr-only">{stat.label}</dt>
                <dd className="text-6xl" style={{ color: stat.tone }}>
                  <CountUp to={stat.value} suffix={stat.suffix} />
                </dd>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </Reveal>
          ))}
        </dl>
      </section>

      {/* ── Shows its working ────────────────────────────────────────────── */}
      <section className="border-b border-rule">
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-20 md:py-24 lg:flex-row lg:gap-16">
          <Reveal className="relative lg:w-[38%]">
            <h2 className="text-4xl md:text-5xl">Every number shows its working</h2>
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted-foreground">
              A split nobody understands is a split nobody trusts. Open any
              figure in Reckon and the steps that produced it are right there —
              not a total handed down, but arithmetic you could have done
              yourself.
            </p>
            <MarginNote side="start" tilt={3} className="top-2">
              <span className="block">nobody trusts a number</span>
              <span className="block">they cannot check</span>
            </MarginNote>
          </Reveal>

          <div className="lg:flex-1">
            <LedgerWorking />
          </div>
        </div>
      </section>

      {/* ── The three places ─────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
        <div className="flex flex-col gap-6">
          {PILLARS.map((pillar, i) => (
            <Reveal key={pillar.title} delay={i * 0.08}>
              {/* Pinned to the page rather than stacked in a table. The tilt
                  is small and alternating — enough that the cards read as put
                  there by hand, not so much that the text fights the ruled
                  lines underneath. */}
              <article
                style={{
                  transform: `rotate(${pillar.tilt})`,
                  borderColor: pillar.tone,
                }}
                className={
                  (i % 2 === 0 ? "sketch-box" : "sketch-box-alt") +
                  " flex flex-col gap-3 bg-card p-6 sm:flex-row sm:gap-10 sm:p-8"
                }
              >
                <div className="sm:w-56 sm:shrink-0">
                  <h3 className="text-3xl">{pillar.title}</h3>
                  <p
                    className="mt-1 font-mono text-[0.6875rem] tracking-[0.14em] uppercase"
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

      {/* ── Proof of continuity ──────────────────────────────────────────── */}
      <section className="border-y border-rule">
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-20 md:py-24">
          <Reveal className="relative max-w-2xl">
            <h2 className="text-4xl md:text-5xl">This is what it looks like inside</h2>
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted-foreground">
              Not a mock-up. These are the actual pieces the app is built from —
              the same stripe down a chore that is due today, the same stamp on
              a debt that is over with.
            </p>
            <MarginNote side="end" tilt={-3} className="top-3">
              <ScrawlArrow flip className="mb-1" />
              <span className="block">no bait and switch</span>
            </MarginNote>
          </Reveal>
          <InsideStrip />
        </div>
      </section>

      {/* ── Last word ────────────────────────────────────────────────────── */}
      <section className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-6 py-20 md:py-28">
        <h2 className="max-w-2xl text-4xl md:text-5xl">
          Stop keeping score in your head
        </h2>
        <p className="max-w-prose text-[0.9375rem] leading-relaxed text-muted-foreground">
          Make a group, add the first expense, send the link. The people you
          live with do not need an account to see what they owe — or to pay it.
        </p>
        <Button render={<Link href="/sign-up" />} nativeButton={false} size="lg">
          Start a group
        </Button>
      </section>
    </div>
  );
}
