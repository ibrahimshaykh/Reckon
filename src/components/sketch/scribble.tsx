"use client";

import { useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

// ---------------------------------------------------------------------------
// Pencil shavings: a burst of debris on click.
// ---------------------------------------------------------------------------

type Shaving = { id: number; dx: number; dy: number; rot: number; size: number; curl: boolean };

let shavingId = 0;

function burst(): Shaving[] {
  return Array.from({ length: 12 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const force = 26 + Math.random() * 46;
    return {
      id: shavingId++,
      dx: Math.cos(angle) * force,
      dy: Math.sin(angle) * force - 14, // biased upward, so it arcs then falls
      rot: (Math.random() - 0.5) * 320,
      size: 3 + Math.random() * 4,
      curl: Math.random() > 0.5,
    };
  });
}

/**
 * Wraps any control so clicking it throws off pencil shavings. The debris is
 * absolutely positioned and pointer-transparent, so it never interferes with
 * the control it decorates.
 */
export function Shavings({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [bits, setBits] = useState<Shaving[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function fire() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setBits(burst());
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setBits([]), 700);
  }

  return (
    <span className={`relative inline-flex ${className ?? ""}`} onPointerDown={fire}>
      {children}
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
        <AnimatePresence>
          {bits.map((b) => (
            <motion.span
              key={b.id}
              initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
              animate={{ opacity: 0, x: b.dx, y: b.dy + 40, rotate: b.rot }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.62, ease: [0.2, 0.7, 0.3, 1] }}
              className="absolute left-1/2 top-1/2 bg-foreground/70"
              style={{
                width: b.size,
                height: b.size * (b.curl ? 1.9 : 0.7),
                borderRadius: b.curl ? "60% 20% 60% 20%" : "2px",
              }}
            />
          ))}
        </AnimatePresence>
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Scribbled-over: a rough marker stroke drawn across the element on hover.
// ---------------------------------------------------------------------------

export function ScribbleOver({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [over, setOver] = useState(false);

  return (
    <span
      className={`relative inline-flex ${className ?? ""}`}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
    >
      {children}
      <svg
        aria-hidden
        viewBox="0 0 120 40"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -inset-1 h-[calc(100%+8px)] w-[calc(100%+8px)] text-negative"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
      >
        {/* Two passes, because one clean sweep looks printed rather than scrawled. */}
        <motion.path
          d="M4 30 C24 8, 40 34, 58 14 S92 32, 116 10"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: over ? 1 : 0 }}
          transition={{ duration: over ? 0.24 : 0.14, ease: "easeOut" }}
        />
        <motion.path
          d="M6 14 C28 34, 44 10, 64 30 S98 12, 114 28"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: over ? 1 : 0 }}
          transition={{ duration: over ? 0.28 : 0.12, ease: "easeOut", delay: over ? 0.05 : 0 }}
        />
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Thumbtacked: hangs from a pin and swings when disturbed.
// ---------------------------------------------------------------------------

export function Thumbtacked({
  children,
  className,
  tilt = 3,
}: {
  children: ReactNode;
  className?: string;
  tilt?: number;
}) {
  return (
    <motion.div
      // Pivoting from the pin rather than the centre is what makes it read as
      // hanging rather than merely rotating.
      style={{ transformOrigin: "12% 0%" }}
      initial={{ rotate: 0 }}
      whileHover={{ rotate: [0, tilt, -tilt * 0.7, tilt * 0.35, 0] }}
      whileTap={{ rotate: tilt * 1.6, scale: 0.985 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={`relative ${className ?? ""}`}
    >
      <span
        aria-hidden
        className="absolute -top-1.5 left-[10%] z-10 size-3 rounded-full border-2 border-foreground bg-negative shadow-[1px_1px_0_0_var(--border)]"
      />
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Pencil-written text: letters appear as though being written, fast.
// ---------------------------------------------------------------------------

export function PencilText({
  text,
  className,
  speed = 0.028,
}: {
  text: string;
  className?: string;
  speed?: number;
}) {
  return (
    <span className={className} aria-label={text}>
      {text.split("").map((char, i) => (
        <motion.span
          key={`${char}-${i}`}
          aria-hidden
          className="inline-block"
          initial={{ opacity: 0, y: 3, rotate: -6 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 0.12, delay: i * speed, ease: "easeOut" }}
        >
          {char === " " ? " " : char}
        </motion.span>
      ))}
    </span>
  );
}
