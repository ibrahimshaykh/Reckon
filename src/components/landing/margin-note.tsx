"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A note written in the page's margin.
 *
 * The signature of this page. Every notebook that has ever been shared has
 * something scrawled beside the main text — a correction, an aside, the bit
 * that actually explains it. A marketing page normally puts that in a grey
 * subheading; here it sits where a person would have written it, out in the
 * red margin, at an angle, in a lighter hand.
 *
 * It carries real content rather than decoration: each note says the thing a
 * sceptical reader would be thinking at that exact point in the page.
 *
 * Hidden below `lg` rather than reflowed. A margin note squeezed into the
 * column is no longer a margin note — it is just another paragraph, and the
 * page reads better without it.
 */
export function MarginNote({
  children,
  side = "start",
  tilt = -3,
  className,
}: {
  children: React.ReactNode;
  /** Which margin to hang in. */
  side?: "start" | "end";
  tilt?: number;
  className?: string;
}) {
  const still = useReducedMotion();

  return (
    <motion.aside
      aria-hidden
      initial={still ? false : { opacity: 0, y: 14, rotate: tilt - 4 }}
      whileInView={{ opacity: 1, y: 0, rotate: tilt }}
      viewport={{ once: true, margin: "-15% 0px" }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "pointer-events-none absolute hidden max-w-[13rem] text-sm leading-snug lg:block",
        // Sits outside the reading column, in the margin proper.
        side === "start" ? "end-full me-8 text-end" : "start-full ms-8",
        className,
      )}
      style={{ color: "var(--feature-availability)" }}
    >
      {children}
    </motion.aside>
  );
}

/**
 * A hand-drawn arrow, for a margin note that is pointing at something.
 *
 * Deliberately not a glyph: an arrow character sits on the text baseline and
 * reads as punctuation. This one is drawn, so it reads as something somebody
 * added afterwards.
 */
export function ScrawlArrow({
  className,
  flip = false,
}: {
  className?: string;
  flip?: boolean;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 64 24"
      className={cn("h-5 w-16", flip && "scale-x-[-1]", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Two strokes rather than one: a drawn arrow is never a single
          confident line, and the slight overshoot on the head is what stops
          it reading as clip-art. */}
      <path d="M2 15c9-6 20-9 33-9 9 0 17 2 27 6" />
      <path d="M52 3c4 4 8 7 10 9-4 1-8 3-12 6" />
    </svg>
  );
}
