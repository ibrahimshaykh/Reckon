"use client";

import { motion } from "motion/react";

// Headline that assembles word by word — the page reads as if it's being
// worked out rather than simply appearing.
export function TextReveal({
  text,
  className,
  accentFrom,
  delay = 0,
}: {
  text: string;
  className?: string;
  /** Index from which words take the accent colour. */
  accentFrom?: number;
  delay?: number;
}) {
  const words = text.split(" ");

  return (
    <span className={className}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="inline-block overflow-hidden align-bottom">
          <motion.span
            className={`inline-block ${
              accentFrom !== undefined && i >= accentFrom ? "text-primary" : ""
            }`}
            initial={{ y: "108%" }}
            animate={{ y: 0 }}
            transition={{
              duration: 0.75,
              delay: delay + i * 0.075,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 && <span>&nbsp;</span>}
        </span>
      ))}
    </span>
  );
}
