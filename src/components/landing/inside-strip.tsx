"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * What it actually looks like behind the login.
 *
 * Not a screenshot — the real components, rebuilt at small scale from the same
 * CSS the app uses. A screenshot goes stale the day after it is taken and
 * looks like a screenshot; these are the app's own devices, so they change
 * when the app changes and they read as part of the page rather than a picture
 * pasted onto it.
 *
 * It exists because the page makes a specific promise — that the inside is
 * legible and hand-made rather than another grid of grey rows — and this is
 * the cheapest honest way to prove it before somebody signs up.
 */

function Tally({ count, tone }: { count: number; tone: string }) {
  const groups: number[] = [];
  for (let i = 0; i < count; i += 5) groups.push(Math.min(5, count - i));

  return (
    <span aria-hidden className="tally-gate" style={{ color: tone }}>
      {groups.map((size, g) => (
        <span key={g} className="tally-group">
          {Array.from({ length: size }, (_, k) => (
            <span key={k} className="tally-mark" data-fifth={k === 4 ? "true" : undefined} />
          ))}
        </span>
      ))}
    </span>
  );
}

const SPECIMENS = [
  {
    label: "A chore that is due today",
    render: () => (
      <div
        data-state="today"
        style={{ borderInlineStartColor: "var(--feature-chores)" }}
        className="state-spine rounded-lg border bg-card p-3"
      >
        <p>
          <strong className="marker-swipe text-base">Take the bins out</strong>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          effort 6 — hard · daily
        </p>
      </div>
    ),
  },
  {
    label: "A debt that is over with",
    render: () => (
      <div className="rounded-lg border bg-card p-3">
        <p className="text-sm text-muted-foreground line-through">
          Lola owes Ibrahim Rs 6,350
        </p>
        <p className="mt-2">
          <span className="stamp text-positive">Settled</span>
        </p>
      </div>
    ),
  },
  {
    label: "A vote, counted",
    render: () => (
      <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3">
        {[
          ["Yes", 7, "var(--positive)"],
          ["If needed", 3, "var(--feature-chores)"],
          ["No", 1, "var(--negative)"],
        ].map(([label, n, tone]) => (
          <div key={String(label)} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
            <Tally count={n as number} tone={tone as string} />
          </div>
        ))}
      </div>
    ),
  },
  {
    label: "The month, totted up",
    render: () => (
      <div className="rounded-lg border bg-card p-3">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          Total spent
        </p>
        <p className="tabular mt-1 text-3xl leading-none">Rs 41,200</p>
        <ul className="mt-3 flex flex-col gap-1 text-xs">
          {[
            ["Electricity", "12,000"],
            ["Groceries", "8,400"],
          ].map(([item, amount]) => (
            <li key={item} className="flex items-baseline gap-2">
              <span>{item}</span>
              <span aria-hidden className="leader-fill" />
              <span className="tabular shrink-0">Rs {amount}</span>
            </li>
          ))}
        </ul>
      </div>
    ),
  },
];

export function InsideStrip() {
  const still = useReducedMotion();

  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {SPECIMENS.map((s, i) => (
        <motion.li
          key={s.label}
          initial={still ? false : { opacity: 0, y: 22, rotate: i % 2 === 0 ? -1.4 : 1.2 }}
          whileInView={{ opacity: 1, y: 0, rotate: i % 2 === 0 ? -0.8 : 0.7 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: 0.5, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-2"
        >
          {s.render()}
          <p className="px-1 text-xs text-muted-foreground">{s.label}</p>
        </motion.li>
      ))}
    </ul>
  );
}
