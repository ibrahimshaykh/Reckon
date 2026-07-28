"use client";

import { useEffect, useRef } from "react";

// Margin scribbles that draw themselves on a loop, plus a grid that drifts
// with the pointer. Both sit behind everything and ignore input entirely.
//
// The parallax is written to CSS custom properties on a single wrapper rather
// than to React state — mouse movement would otherwise re-render the tree on
// every frame.
const DOODLES = [
  // top-left: an arrow curling toward the content
  { d: "M14 26 C40 6, 74 10, 92 34 M92 34 L80 30 M92 34 L86 46", top: "9%", left: "2.5%", size: 110, depth: 26, delay: 0 },
  // a star, drawn in one stroke the way you'd doodle it
  { d: "M50 6 L61 38 L95 38 L67 57 L78 90 L50 70 L22 90 L33 57 L5 38 L39 38 Z", top: "34%", left: "1.5%", size: 74, depth: 40, delay: 1.1 },
  // spiral
  { d: "M50 50 m0 -4 a4 4 0 1 1 -4 4 a8 8 0 1 1 8 8 a13 13 0 1 1 -13 -13 a19 19 0 1 1 19 19 a26 26 0 1 1 -26 -26", top: "68%", left: "3%", size: 92, depth: 18, delay: 2.2 },
  // exclamation, top-right
  { d: "M50 12 L50 62 M50 78 L50 86", top: "14%", right: "3%", size: 60, depth: 34, delay: 0.6 },
  // a little cloud
  { d: "M20 62 a16 16 0 0 1 4 -31 a22 22 0 0 1 42 -4 a15 15 0 0 1 12 35 Z", top: "45%", right: "1.5%", size: 104, depth: 22, delay: 1.7 },
  // squiggly underline
  { d: "M6 50 q12 -16 24 0 t24 0 t24 0 t24 0", top: "80%", right: "4%", size: 120, depth: 30, delay: 2.8 },
];

export function DoodleBackdrop() {
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = wrap.current;
    if (!el) return;

    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;

    const onMove = (e: PointerEvent) => {
      // -1..1 from centre, so the drift is symmetrical about the middle.
      targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    const frame = () => {
      // Easing toward the target rather than snapping gives the page weight;
      // the paper lags behind the hand.
      x += (targetX - x) * 0.06;
      y += (targetY - y) * 0.06;
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
      {/* The ruled sheet, shifted opposite the pointer so it reads as depth. */}
      <div
        className="absolute -inset-16 opacity-60"
        style={{
          transform:
            "translate3d(calc(var(--par-x) * -14px), calc(var(--par-y) * -14px), 0)",
          backgroundImage: `
            repeating-linear-gradient(to bottom, transparent 0 27px, color-mix(in oklab, var(--feature-availability) 20%, transparent) 27px 28px),
            repeating-linear-gradient(to right, transparent 0 27px, color-mix(in oklab, var(--foreground) 5%, transparent) 27px 28px)
          `,
        }}
      />
      {/* Red margin rule, closer to the viewer so it travels further. */}
      <div
        className="absolute inset-y-0 left-[8%] w-px bg-negative/35 sm:left-[6%]"
        style={{
          transform: "translate3d(calc(var(--par-x) * -26px), 0, 0)",
        }}
      />

      {DOODLES.map((doodle, i) => (
        <svg
          key={i}
          viewBox="0 0 100 100"
          width={doodle.size}
          height={doodle.size}
          className="absolute text-foreground/20"
          style={{
            top: doodle.top,
            left: doodle.left,
            right: doodle.right,
            transform: `translate3d(calc(var(--par-x) * ${doodle.depth}px), calc(var(--par-y) * ${doodle.depth}px), 0)`,
          }}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d={doodle.d}
            // dasharray = the whole path, so offsetting by the same amount
            // hides it completely and animating to 0 draws it back on.
            style={{
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ["--len" as any]: 400,
              strokeDasharray: 400,
              animation: `draw-on 3.2s ease-in-out ${doodle.delay}s infinite alternate`,
            }}
          />
        </svg>
      ))}
    </div>
  );
}
