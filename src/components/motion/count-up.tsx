"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";

// Money that counts up when it scrolls into view. Tabular numerals keep the
// width stable so the surrounding layout never jitters while it runs.
export function CountUp({
  to,
  prefix = "",
  suffix = "",
  duration = 1200,
  className,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(to);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // ease-out cubic — fast first, settling into the final figure
      setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, to, duration]);

  return (
    <span ref={ref} className={`tabular ${className ?? ""}`}>
      {prefix}
      {value.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}
