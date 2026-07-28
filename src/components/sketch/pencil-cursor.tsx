"use client";

import { useEffect, useRef, useState } from "react";

type Pt = { x: number; y: number };

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
        nib.current.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${
          pressed.current ? -18 : -8
        }deg) scale(${pressed.current ? 0.86 : 1})`;
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
      >
        <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
          {/* shaft */}
          <path
            d="M6 24 L20 5 L25 8.5 L11 27.5 Z"
            className="fill-warm-surface stroke-foreground"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {/* the sharpened end, pointing at the hotspot in the corner */}
          <path
            d="M6 24 L11 27.5 L3.5 29.5 Z"
            className="fill-foreground stroke-foreground"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          {/* ferrule */}
          <path
            d="M18.5 7 L23.5 10.5"
            className="stroke-foreground"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </>
  );
}
