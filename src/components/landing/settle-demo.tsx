"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

// The thesis of the whole product, animated: a tangle of who-paid-what
// collapsing into the fewest transfers that clear everyone. These are the
// same figures the headline names, so the claim and the demo agree.
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

export function SettleDemo() {
  const [resolved, setResolved] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStill(true);
      setResolved(true);
      return;
    }
    const id = setInterval(() => setResolved((v) => !v), 3400);
    return () => clearInterval(id);
  }, []);

  const rows = resolved ? RESOLVED : TANGLED;

  return (
    <div className="ledger-panel w-full rounded-r-xl p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-3">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
          {resolved ? "Settled" : "Owed"}
        </p>
        <p className="tabular font-mono text-[0.6875rem] text-muted-foreground">
          {rows.length} {rows.length === 1 ? "payment" : "payments"}
        </p>
      </div>

      <ul className="mt-1 flex min-h-[13.5rem] flex-col">
        <AnimatePresence mode="popLayout" initial={false}>
          {rows.map((row, i) => (
            <motion.li
              key={`${resolved ? "r" : "t"}-${row.from}-${row.to}`}
              layout={!still}
              initial={still ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={still ? undefined : { opacity: 0, y: -8 }}
              transition={{
                duration: 0.32,
                delay: still ? 0 : i * 0.05,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="flex items-baseline gap-3 border-b border-rule/50 py-2.5 last:border-0"
            >
              <span className="text-sm">
                <span className="font-medium text-foreground">{row.from}</span>
                <span aria-hidden className="mx-2 font-mono text-muted-foreground">
                  →
                </span>
                <span className="font-medium text-foreground">{row.to}</span>
              </span>
              <span
                className={`tabular ml-auto text-sm font-semibold ${
                  resolved ? "text-primary" : "text-ledger-foreground"
                }`}
              >
                {row.amount}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <p className="border-t border-rule pt-3 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">
        {resolved ? "Nobody is left out of pocket" : "Before reckoning"}
      </p>
    </div>
  );
}
