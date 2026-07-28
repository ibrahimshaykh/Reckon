"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PENCILS, useSketchpad, type Entry } from "@/lib/stores/sketchpad";

/* ===========================================================================
   HOW THE PENCIL-DRAWING EFFECT WORKS  (tune the speeds here)

   Every "drawn" line is an SVG <path> animated on `pathLength`. Motion
   normalises pathLength to 0–1, so `initial={{ pathLength: 0 }}` hides the
   stroke entirely and animating to 1 walks the pen along it. No manual
   stroke-dasharray maths required.

     DRAW    — seconds for one stroke to finish. Lower = faster scribbling.
     STAGGER — gap between successive strokes, so it reads as one hand
               working through a drawing rather than everything at once.
     STRIKE  — speed of the red cross-out. Deliberately quicker than DRAW:
               crossing out is impatient, drawing is careful.
   =========================================================================== */
const DRAW = 0.75;
const STAGGER = 0.09;
const STRIKE = 0.28;

const PEN_EASE = [0.22, 1, 0.36, 1] as const;

/* ---------------------------------------------------------------------------
   WHERE THINGS GO

   The complaint with the first version was everything piling into the top-left
   while the rest of the sheet sat empty. These are the resting places around
   the page — alternating sides, staggered down — and entries are dealt into
   them in order. The centre column is left clear because the app lives there.
   `side` decides which way a note leans and which way it flies in from.
--------------------------------------------------------------------------- */
const SLOTS = [
  { side: "left" as const, top: "11%", inset: "1.5%", depth: 26, tilt: -2.2 },
  { side: "right" as const, top: "17%", inset: "2%", depth: 34, tilt: 1.8 },
  { side: "left" as const, top: "52%", inset: "2.5%", depth: 40, tilt: 1.4 },
  { side: "right" as const, top: "60%", inset: "1.5%", depth: 30, tilt: -1.6 },
];

// ---------------------------------------------------------------------------
// Ornaments
// ---------------------------------------------------------------------------

function CompassRose({ tone }: { tone: string }) {
  return (
    <motion.svg
      viewBox="0 0 100 100"
      className="absolute bottom-[6%] right-[6%] w-20 opacity-40"
      style={{
        color: tone,
        transform: "translate3d(calc(var(--par-x) * 18px), calc(var(--par-y) * 18px), 0)",
      }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial="hidden"
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: STAGGER } } }}
    >
      {[
        "M50 6 L58 42 L50 50 L42 42 Z",
        "M94 50 L58 58 L50 50 L58 42 Z",
        "M50 94 L42 58 L50 50 L58 58 Z",
        "M6 50 L42 42 L50 50 L42 58 Z",
        "M50 50 m-34 0 a34 34 0 1 0 68 0 a34 34 0 1 0 -68 0",
      ].map((d, i) => (
        <motion.path
          key={i}
          d={d}
          variants={{
            hidden: { pathLength: 0, opacity: 0 },
            shown: { pathLength: 1, opacity: 1, transition: { duration: DRAW, ease: PEN_EASE } },
          }}
        />
      ))}
    </motion.svg>
  );
}

/** Pencil shading — many short strokes, the way you'd actually shade. */
function Hatch({ tone, className, lines = 6 }: { tone: string; className?: string; lines?: number }) {
  return (
    <svg
      viewBox="0 0 40 30"
      className={className}
      style={{ color: tone }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeLinecap="round"
    >
      {Array.from({ length: lines }, (_, i) => (
        <motion.path
          key={i}
          d={`M${2 + i * 6} 28 L${11 + i * 6} 3`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, delay: i * 0.05, ease: "easeOut" }}
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// One page's worth of notes: the heading, then what you did there.
// ---------------------------------------------------------------------------

function EntryBlock({ entry, slot }: { entry: Entry; slot: (typeof SLOTS)[number] }) {
  const tone = PENCILS[entry.pencil];
  const fromRight = slot.side === "right";

  return (
    <motion.div
      className="absolute w-[15rem] sm:w-[17rem]"
      style={{
        top: slot.top,
        [slot.side]: slot.inset,
        color: tone,
        // Each block sits at its own depth, so the sheet layers under parallax.
        transform: `translate3d(calc(var(--par-x) * ${slot.depth}px), calc(var(--par-y) * ${slot.depth}px), 0)`,
      }}
      initial={{ opacity: 0, x: fromRight ? 40 : -40, rotate: 0 }}
      animate={{ opacity: entry.struck ? 0.5 : 0.95, x: 0, rotate: slot.tilt }}
      exit={{ opacity: 0, x: fromRight ? 30 : -30, transition: { duration: 0.25 } }}
      transition={{ type: "spring", stiffness: 130, damping: 16, mass: 0.7 }}
    >
      {/* --- the heading --- */}
      <div className="relative flex items-baseline gap-2">
        {/* Ornate drop-cap flourish, drawn each time a heading appears. */}
        <svg
          viewBox="0 0 20 20"
          className="mt-1 size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
        >
          <motion.path
            d="M3 10 C3 4, 12 4, 12 10 C12 16, 5 15, 6 10 C7 6, 17 8, 17 13"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: DRAW, ease: PEN_EASE }}
          />
        </svg>

        <span
          className="text-[1.35rem] leading-tight sm:text-[1.5rem]"
          style={{ fontFamily: "var(--font-hand-display), cursive" }}
        >
          {entry.label}
        </span>

        {/* Crossed out once you've moved on — two impatient slashes. */}
        {entry.struck && (
          <svg
            viewBox="0 0 100 16"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-x-0 top-1/2 h-5 -translate-y-1/2"
            style={{ color: PENCILS.cherry }}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
          >
            <motion.path
              d="M2 10 C26 3, 52 13, 98 5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: STRIKE, ease: "easeOut" }}
            />
            <motion.path
              d="M4 5 C30 12, 58 4, 96 11"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: STRIKE, delay: 0.06, ease: "easeOut" }}
            />
          </svg>
        )}
      </div>

      {/* Underline beneath the heading, drawn left to right. */}
      <svg
        viewBox="0 0 200 8"
        preserveAspectRatio="none"
        className="mt-0.5 h-2 w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      >
        <motion.path
          d="M2 5 C40 2, 80 7, 120 3 S180 6, 198 4"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: DRAW, delay: 0.1, ease: PEN_EASE }}
        />
      </svg>

      {/* --- what happened here, as sub-entries --- */}
      <ul className="mt-1.5 flex flex-col gap-1 ps-6">
        <AnimatePresence initial={false}>
          {entry.jottings.map((j, i) => (
            <motion.li
              key={j.id}
              className="flex items-start gap-1.5 text-[0.95rem] leading-snug"
              style={{ fontFamily: "var(--font-hand), cursive" }}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 0.9, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: i * STAGGER }}
            >
              {/* A tick for done, a dash for merely noted. */}
              <svg
                viewBox="0 0 16 16"
                className="mt-1 size-3 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <motion.path
                  d={j.done ? "M2 8 L6 12 L14 3" : "M2 8 L14 8"}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.34, delay: 0.1 + i * STAGGER, ease: PEN_EASE }}
                />
              </svg>
              <span className="min-w-0 break-words">{j.text}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {/* A little shading, so the block has weight on the page. */}
      {entry.jottings.length > 0 && (
        <Hatch tone={tone} className="mt-1 h-4 w-14 opacity-45" lines={5} />
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------

export function LivingBackground() {
  const entries = useSketchpad((s) => s.entries);
  const turnKey = useSketchpad((s) => s.turnKey);
  const wrap = useRef<HTMLDivElement>(null);

  // Parallax goes to CSS custom properties, never React state: pointer moves
  // must not re-render this tree, or every doodle restarts its drawing.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = wrap.current;
    if (!el) return;

    let raf = 0;
    let tx = 0, ty = 0, x = 0, y = 0;
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const frame = () => {
      // Easing rather than snapping gives the paper weight — it lags the hand.
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
      el.style.setProperty("--par-x", x.toFixed(4));
      el.style.setProperty("--par-y", y.toFixed(4));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div
      ref={wrap}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden [--par-x:0] [--par-y:0] lg:block"
    >
      <AnimatePresence initial={false}>
        {entries.map((entry, i) => (
          <EntryBlock key={entry.id} entry={entry} slot={SLOTS[i % SLOTS.length]} />
        ))}
      </AnimatePresence>

      <CompassRose tone={PENCILS.indigo} />

      <AnimatePresence>
        {turnKey > 0 && (
          <motion.div
            key={turnKey}
            className="page-turn-sheet absolute inset-0 origin-left"
            style={{
              background:
                "linear-gradient(102deg, transparent 0%, var(--card) 12%, var(--background) 55%, var(--card) 88%, transparent 100%)",
              boxShadow: "0 0 60px 0 rgb(0 0 0 / 0.18)",
              animation: "page-turn 0.7s cubic-bezier(0.4, 0, 0.2, 1) 1",
            }}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
