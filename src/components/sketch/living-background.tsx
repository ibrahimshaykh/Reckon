"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PENCILS, useSketchpad, type Crumb, type MarginItem } from "@/lib/stores/sketchpad";

/* ===========================================================================
   HOW THE PENCIL-DRAWING EFFECT WORKS  (tune the speeds here)

   Every "drawn" line is an SVG <path> animated on `pathLength`. Motion
   normalises pathLength to 0–1, so `initial={{ pathLength: 0 }}` hides the
   stroke entirely and animating to 1 walks the pen along it. No manual
   stroke-dasharray maths required.

   The three numbers worth touching:

     DRAW  — seconds for one stroke to complete. Lower = faster scribbling.
     STAGGER — gap between successive strokes in a group. This is what makes
               it look like one hand working through a drawing rather than
               everything appearing at once.
     STRIKE — how fast the red cross-out is slashed through an old crumb.
               Kept deliberately quicker than DRAW; crossing out is an
               impatient gesture, drawing is a careful one.
   =========================================================================== */
const DRAW = 0.75;
const STAGGER = 0.09;
const STRIKE = 0.28;

/** Shared easing: quick off the mark, settling at the end, like a real stroke. */
const PEN_EASE = [0.22, 1, 0.36, 1] as const;

// ---------------------------------------------------------------------------
// Ornaments — self-drawing decorative pieces that fill the empty gutters.
// ---------------------------------------------------------------------------

function CompassRose({ tone }: { tone: string }) {
  return (
    <motion.svg
      viewBox="0 0 100 100"
      className="absolute right-[3%] top-[52%] w-24 opacity-50"
      style={{ color: tone, transform: "translate3d(calc(var(--par-x) * 18px), calc(var(--par-y) * 18px), 0)" }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial="hidden"
      animate="shown"
      // Children inherit this timeline, so the rose assembles point by point.
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

/** Pencil shading. Real cross-hatching is many short strokes, not a fill. */
function Hatch({
  tone,
  className,
  lines = 7,
}: {
  tone: string;
  className?: string;
  lines?: number;
}) {
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
          d={`M${2 + i * 5} 28 L${10 + i * 5} 2`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          // Each hatch stroke lands a beat after the last — the rhythm is what
          // sells it as a hand shading in, rather than a texture appearing.
          transition={{ duration: 0.3, delay: i * 0.05, ease: "easeOut" }}
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumbs — the route, written down the top-left margin.
// ---------------------------------------------------------------------------

function CrumbLine({ crumb, index }: { crumb: Crumb; index: number }) {
  const tone = PENCILS[crumb.pencil];

  return (
    <motion.li
      className="relative flex items-baseline gap-1.5"
      style={{ paddingInlineStart: crumb.depth * 10, color: tone }}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: crumb.struck ? 0.45 : 0.85, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
    >
      {/* Decorative drop-cap flourish before each entry. */}
      <svg viewBox="0 0 20 20" className="mt-0.5 size-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        <motion.path
          d="M3 10 C3 4, 12 4, 12 10 C12 16, 5 15, 6 10 C7 6, 17 8, 17 13"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: DRAW, ease: PEN_EASE }}
        />
      </svg>

      <span
        className="whitespace-nowrap text-[0.8rem] leading-tight"
        style={{ fontFamily: "var(--font-hand-display), cursive" }}
      >
        {crumb.label}
      </span>

      {/* The cross-out. Two impatient slashes rather than one neat rule. */}
      {crumb.struck && (
        <svg
          viewBox="0 0 100 16"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 top-1/2 h-4 -translate-y-1/2"
          style={{ color: PENCILS.cherry }}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
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
    </motion.li>
  );
}

// ---------------------------------------------------------------------------
// Margin inventory — saved things, taped into the gutters.
// ---------------------------------------------------------------------------

const KIND_GLYPH: Record<MarginItem["kind"], string> = {
  expense: "M4 14 h24 v14 h-24 z M10 21 h12",
  group: "M10 12 a5 5 0 1 0 0.01 0 M22 12 a5 5 0 1 0 0.01 0 M4 28 c2 -7 22 -7 24 0",
  person: "M16 11 a5 5 0 1 0 0.01 0 M6 29 c2 -8 18 -8 20 0",
  chore: "M6 24 L20 8 M18 26 L26 30 M6 24 L14 30",
  note: "M8 8 h16 v20 l-8 -5 l-8 5 z",
};

function MarginNote({ item, index }: { item: MarginItem; index: number }) {
  const tone = PENCILS[item.pencil];

  return (
    <motion.div
      className="absolute w-32"
      style={{
        left: `${item.x}%`,
        top: `${item.y}%`,
        color: tone,
        // Margin notes sit deeper than the ruled sheet, so they travel further
        // under parallax and the paper gains real depth.
        transform: `translate3d(calc(var(--par-x) * 30px), calc(var(--par-y) * 30px), 0)`,
      }}
      // Thrown into the margin: it arrives from the middle of the page,
      // overshoots, then settles at a jaunty angle.
      initial={{ opacity: 0, scale: 0.6, x: item.x > 50 ? -120 : 120, rotate: 0 }}
      animate={{ opacity: 0.85, scale: 1, x: 0, rotate: item.rot }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.25 } }}
      transition={{ type: "spring", stiffness: 120, damping: 13, mass: 0.7 }}
    >
      {/* Fixing: how this scrap is attached to the page. */}
      {item.fixing === "tape" && (
        <span
          className="absolute -top-2 left-1/2 h-4 w-12 -translate-x-1/2 -rotate-3 border border-current/40 bg-current/10"
          style={{ borderRadius: "5px 9px 5px 10px / 9px 5px 10px 5px" }}
        />
      )}
      {item.fixing === "pin" && (
        <span className="absolute -top-1.5 left-3 size-2.5 rounded-full border-2 border-current bg-current/30" />
      )}
      {item.fixing === "staple" && (
        <span className="absolute -top-1 left-4 h-2 w-4 border-x-2 border-t-2 border-current" />
      )}

      <div
        className="relative border-2 px-2 py-1.5"
        style={{
          borderColor: "currentColor",
          borderRadius: "18px 40px 16px 36px / 36px 16px 40px 18px",
        }}
      >
        <div className="flex items-start gap-1.5">
          <svg viewBox="0 0 32 32" className="mt-0.5 size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <motion.path
              d={KIND_GLYPH[item.kind]}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: DRAW, delay: 0.15 + index * STAGGER, ease: PEN_EASE }}
            />
          </svg>
          <div className="min-w-0">
            <p
              className="truncate text-[0.7rem] uppercase tracking-wide"
              style={{ fontFamily: "var(--font-hand-display), cursive" }}
            >
              {item.label}
            </p>
            {item.detail && (
              <p className="truncate font-mono text-[0.6rem] opacity-80">{item.detail}</p>
            )}
          </div>
        </div>

        {/* A little shading in the corner, so the note has weight. */}
        <Hatch tone={tone} className="absolute -bottom-1 -right-1 h-4 w-6 opacity-50" lines={4} />
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// The background itself.
// ---------------------------------------------------------------------------

export function LivingBackground() {
  const trail = useSketchpad((s) => s.trail);
  const items = useSketchpad((s) => s.items);
  const turnKey = useSketchpad((s) => s.turnKey);
  const wrap = useRef<HTMLDivElement>(null);

  // Parallax is written to CSS custom properties rather than React state:
  // pointer movement must not re-render this tree, or every doodle re-animates.
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
      // Easing toward the target gives the paper weight — it lags the hand.
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
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden [--par-x:0] [--par-y:0]"
    >
      {/* --- the route, written down the top-left margin --- */}
      <ul className="absolute left-[1.5%] top-[13%] flex w-40 flex-col gap-1.5 sm:w-48">
        <AnimatePresence initial={false}>
          {trail.map((crumb, i) => (
            <CrumbLine key={crumb.id} crumb={crumb} index={i} />
          ))}
        </AnimatePresence>
      </ul>

      {/* --- saved things, thrown into the gutters --- */}
      <AnimatePresence initial={false}>
        {items.map((item, i) => (
          <MarginNote key={item.id} item={item} index={i} />
        ))}
      </AnimatePresence>

      <CompassRose tone={PENCILS.indigo} />
      <Hatch tone={PENCILS.sunshine} className="absolute bottom-[8%] left-[4%] h-10 w-16 opacity-40" />

      {/* --- page turn: a sheet dragged across on section change --- */}
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
