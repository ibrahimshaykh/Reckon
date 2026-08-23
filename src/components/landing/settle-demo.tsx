"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";

/**
 * The thesis of the product, performed rather than illustrated.
 *
 * Five tangled debts get struck out one at a time as the reader scrolls, in
 * the order somebody working on paper would actually cross them off, and then
 * the two payments that clear everyone write themselves in.
 *
 * Scrubbed to the scroll rather than played on a timer. A timed animation
 * runs whether anybody is watching or not and is always either too fast to
 * follow or too slow to sit through; tied to the scroll, the reader sets the
 * pace and the crossing-out happens at reading speed because it *is* reading
 * speed. It is also the one place on the page where scroll does real work
 * instead of just fading things in.
 */

const TANGLED = [
  { from: "Ayesha", to: "Bilal", amount: "Rs 1,200" },
  { from: "Bilal", to: "Sana", amount: "Rs 900" },
  { from: "Sana", to: "Ayesha", amount: "Rs 750" },
  { from: "Omar", to: "Bilal", amount: "Rs 450" },
  { from: "Sana", to: "Omar", amount: "Rs 600" },
];

const RESOLVED = [
  { from: "Ayesha", to: "Bilal", amount: "Rs 1,050" },
  { from: "Sana", to: "Omar", amount: "Rs 150" },
];

/** Why each line gets crossed off, in the order a person would do it. */
const REASONS = [
  "netted against what Bilal owes Sana",
  "cancels through Sana",
  "already counted the other way",
  "folds into Bilal's total",
  "leaves Rs 150 outstanding",
];

// How far down the page the reckoning is spread. Short enough that it happens
// while the hero is still the thing being read, long enough that five strikes
// do not all land at once.
const SCRUB_END = 0.085;

export function SettleDemo() {
  const [struck, setStruck] = useState(0);
  const [resolved, setResolved] = useState(false);
  const [still, setStill] = useState(false);
  const [manual, setManual] = useState(false);

  const { scrollYProgress } = useScroll();

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (manual || still) return;

    // 0 → 1 across the scrub window, then one step per row plus a final step
    // for the resolved state.
    const p = Math.min(1, Math.max(0, v / SCRUB_END));
    const steps = Math.floor(p * (TANGLED.length + 1));

    setStruck(Math.min(TANGLED.length, steps));
    setResolved(steps > TANGLED.length);
  });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStill(true);
      setStruck(TANGLED.length);
      setResolved(true);
    }
  }, []);

  const rows = resolved ? RESOLVED : TANGLED;

  return (
    <button
      type="button"
      onClick={() => {
        if (still) return;
        setManual(true);
        setResolved((v) => !v);
        setStruck((v) => (v === TANGLED.length ? 0 : TANGLED.length));
      }}
      aria-label={resolved ? "Show the debts before reckoning" : "Reckon these debts"}
      className="ledger-panel group/demo w-full cursor-pointer rounded-e-xl p-5 text-left shadow-[0_1px_0_var(--rule),0_18px_50px_-28px_var(--primary)] transition-shadow hover:shadow-[0_1px_0_var(--rule),0_26px_60px_-24px_var(--primary)] sm:p-6"
    >
      {/* The panel swaps as one unit — the state label, the row count and the
          rows themselves must never disagree on screen. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={resolved ? "resolved" : "tangled"}
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={still ? undefined : { opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-3">
            <p className="font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">
              {resolved ? "Settled" : "Owed"}
            </p>
            <p className="tabular font-mono text-[0.6875rem] text-muted-foreground">
              {rows.length} {rows.length === 1 ? "payment" : "payments"}
            </p>
          </div>

          <ul className="mt-1 flex min-h-[13.5rem] flex-col">
            {rows.map((row, i) => {
              const isStruck = !resolved && i < struck;

              return (
                <motion.li
                  key={`${row.from}-${row.to}`}
                  initial={still ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.3,
                    delay: still ? 0 : 0.06 + i * 0.05,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="relative flex items-baseline gap-3 border-b border-rule/50 py-2.5 last:border-0"
                >
                  <span className="text-sm">
                    <span className="font-medium text-foreground">{row.from}</span>
                    <span aria-hidden className="mx-2 font-mono text-muted-foreground">
                      →
                    </span>
                    <span className="font-medium text-foreground">{row.to}</span>
                  </span>

                  {/* The reason, arriving with the strike. Crossing a line out
                      without saying why is a magic trick; this is the page's
                      whole argument about showing its working, so the demo has
                      to make it too. */}
                  <AnimatePresence>
                    {isStruck && (
                      <motion.span
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25, delay: 0.12 }}
                        className="hidden text-[0.6875rem] text-muted-foreground sm:block"
                      >
                        {REASONS[i]}
                      </motion.span>
                    )}
                  </AnimatePresence>

                  <span
                    className={`tabular ms-auto text-sm font-semibold transition-colors duration-300 ${
                      resolved
                        ? "text-primary"
                        : isStruck
                          ? "text-muted-foreground"
                          : "text-ledger-foreground"
                    }`}
                  >
                    {row.amount}
                  </span>

                  {/* The strike itself: drawn across the row from the left,
                      slightly off-horizontal so it reads as a pen stroke
                      rather than a text-decoration line. */}
                  <motion.span
                    aria-hidden
                    initial={false}
                    animate={{ scaleX: isStruck ? 1 : 0 }}
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      originX: 0,
                      background: "var(--negative)",
                      rotate: "-0.7deg",
                    }}
                    className="pointer-events-none absolute inset-x-0 top-1/2 h-px opacity-70"
                  />
                </motion.li>
              );
            })}
          </ul>

          <p className="flex items-center justify-between gap-3 border-t border-rule pt-3 font-mono text-[0.6875rem] tracking-[0.14em] text-muted-foreground uppercase">
            <span>
              {resolved
                ? "Nobody is left out of pocket"
                : struck === 0
                  ? "Before reckoning"
                  : `${struck} of ${TANGLED.length} netted off`}
            </span>
            <span className="opacity-0 transition-opacity group-hover/demo:opacity-100">
              {resolved ? "Undo" : "Reckon"}
            </span>
          </p>
        </motion.div>
      </AnimatePresence>
    </button>
  );
}
