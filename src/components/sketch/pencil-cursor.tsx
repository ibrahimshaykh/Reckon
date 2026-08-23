"use client";

import { useEffect, useRef, useState } from "react";

type Pt = { x: number; y: number };

// Where the graphite point sits within the 32×32 pencil drawing. The pencil is
// drawn nib-first at the top-left and body trailing down-right, matching how a
// normal arrow cursor works — the hotspot is the corner you point with.
const TIP_X = 2.5;
const TIP_Y = 2.5;

// A pencil that follows the pointer, trailing graphite that fades. The trail
// is drawn to a canvas rather than as DOM nodes — one element and one paint
// per frame, instead of dozens of divs being created and garbage collected
// while the mouse moves.
export function PencilCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = useState(false);
  const point = useRef<Pt>({ x: -100, y: -100 });
  const nib = useRef<HTMLDivElement>(null);
  const pressed = useRef(false);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || still) return;
    setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    // The trail is a short tail of recent positions, not the whole path —
    // otherwise the drawing accumulates until the page is a scribble.
    const tail: Pt[] = [];
    let last: Pt | null = null;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };
    resize();

    const onMove = (e: PointerEvent) => {
      point.current = { x: e.clientX, y: e.clientY };
    };
    const onDown = () => (pressed.current = true);
    const onUp = () => (pressed.current = false);

    const frame = () => {
      const { x, y } = point.current;

      if (nib.current) {
        // TIP_X/TIP_Y are where the graphite point sits inside the SVG. Sub-
        // tracting them puts that point exactly on the pointer coordinate, so
        // what you click is what the pencil appears to be touching. Rotation
        // pivots about the same point (see transform-origin below), otherwise
        // tilting on press would swing the nib away from the target.
        nib.current.style.transform = `translate3d(${x - TIP_X}px, ${y - TIP_Y}px, 0) rotate(${
          pressed.current ? 9 : 0
        }deg) scale(${pressed.current ? 0.92 : 1})`;
      }

      // Only extend the tail once the pointer has actually travelled, so a
      // resting cursor doesn't keep laying graphite in one spot.
      if (!last || Math.hypot(x - last.x, y - last.y) > 2.5) {
        tail.push({ x, y });
        last = { x, y };
        if (tail.length > 26) tail.shift();
      } else if (tail.length > 0 && Math.random() > 0.55) {
        tail.shift();
      }

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 1; i < tail.length; i++) {
        const t = i / tail.length;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(60, 60, 70, ${t * 0.34})`;
        ctx.lineWidth = 0.6 + t * 2.1;
        // Nudging each segment slightly off the true path keeps the line
        // from looking machine-straight.
        const wobble = (1 - t) * 1.6;
        ctx.moveTo(
          tail[i - 1].x + (Math.random() - 0.5) * wobble,
          tail[i - 1].y + (Math.random() - 0.5) * wobble,
        );
        ctx.lineTo(tail[i].x, tail[i].y);
        ctx.stroke();
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", resize);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[9998]"
      />
      <div
        ref={nib}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[9999] will-change-transform"
        // Tilting on press must rotate about the nib, not the middle of the
        // drawing, or the point would swing off whatever it's pointing at.
        style={{ transformOrigin: `${TIP_X}px ${TIP_Y}px` }}
      >
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          {/* Graphite point — the tip of this triangle is the hotspot. */}
          <path
            d="M2.5 2.5 L10 5.5 L5.5 10 Z"
            style={{ fill: "var(--pencil-graphite)", stroke: "var(--pencil-outline)" }}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* Sharpened wood collar, just behind the graphite. */}
          <path
            d="M10 5.5 L13 8.5 L8.5 13 L5.5 10 Z"
            style={{ stroke: "var(--pencil-outline)" }}
            className="fill-warm-surface"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          {/* Barrel, running away from the hand's point of contact. */}
          <path
            d="M13 8.5 L24 19.5 L19.5 24 L8.5 13 Z"
            style={{ fill: "var(--pencil-sunshine)", stroke: "var(--pencil-outline)" }}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Ferrule. */}
          <path
            d="M24 19.5 L26.5 22 L22 26.5 L19.5 24 Z"
            style={{ stroke: "var(--pencil-outline)" }}
            className="fill-muted"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          {/* Eraser at the far end. */}
          <path
            d="M26.5 22 L29.5 25 L25 29.5 L22 26.5 Z"
            style={{ fill: "var(--pencil-cherry)", stroke: "var(--pencil-outline)" }}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </>
  );
}
