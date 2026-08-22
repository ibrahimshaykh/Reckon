"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * The arithmetic, writing itself out.
 *
 * The section beside this claims that every figure shows its working. A static
 * list of steps asserts that; this demonstrates it — the lines arrive one after
 * another, in the order a person would actually reason through them, so the
 * reader watches the total being derived rather than being handed it.
 *
 * The delay between lines is the point. Instant would be a list; slow enough
 * to follow is an argument.
 */
const STEPS = [
  "Ayesha owes Rs 1,200 across three shared bills.",
  "Sana owes Ayesha Rs 750 — netted off first.",
  "Omar and Bilal cancel out entirely.",
  "Largest debtor matched to largest creditor.",
];

export function LedgerWorking() {
  const still = useReducedMotion();

  return (
    <div className="ledger-panel rounded-e-lg p-5">
      <p className="tabular text-sm font-semibold">Ayesha owes Bilal Rs 1,050</p>

      <ul className="mt-3 flex flex-col gap-2 border-t border-rule pt-3">
        {STEPS.map((step, i) => (
          <motion.li
            key={step}
            initial={still ? false : { opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-12% 0px" }}
            transition={{
              duration: 0.4,
              // Staggered so the reasoning arrives in sequence. Reading order
              // is the whole content of this component.
              delay: still ? 0 : 0.18 + i * 0.28,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="ledger-step tabular text-xs leading-relaxed"
          >
            {step}
          </motion.li>
        ))}
      </ul>

      <motion.p
        initial={still ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-12% 0px" }}
        transition={{ duration: 0.4, delay: still ? 0 : 0.18 + STEPS.length * 0.28 }}
        className="mt-3 border-t-2 border-rule pt-2 text-xs text-muted-foreground"
      >
        Two transfers clear all five debts.
      </motion.p>
    </div>
  );
}
