"use client";

import { useEffect } from "react";
import Lenis from "lenis";

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Lenis measures how far there is to scroll by watching one element's
    // box size with a ResizeObserver, and by default that element is
    // <html>. This app's <html> carries Tailwind's h-full (height: 100%),
    // which pins its box to exactly the viewport forever -- growing the
    // page by revealing a panel below the fold changes scrollHeight but
    // never changes <html>'s own box size, so the observer never fires and
    // Lenis's cached scroll limit goes stale. <body> has no such ceiling
    // (only min-h-full, a floor), so its box genuinely grows with the
    // content and the observer sees it.
    const lenis = new Lenis({ duration: 0.9, wheelMultiplier: 0.9, content: document.body });
    let frame = requestAnimationFrame(function raf(time) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    });

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return null;
}
