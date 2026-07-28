import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Marquee } from "@/components/ui/marquee";
import { STICK_CAST } from "@/components/sketch/stickman";

// Two wobble shapes, alternated by index. Adjacent panels drawn by hand are
// never the same shape twice, and reusing one radius everywhere immediately
// reads as CSS again.
export function SketchPanel({
  children,
  className,
  variant = 0,
  tone,
}: {
  children: ReactNode;
  className?: string;
  variant?: number;
  /** Optional pen colour for the border, e.g. var(--feature-chores). */
  tone?: string;
}) {
  return (
    <div
      style={tone ? ({ borderColor: tone } as React.CSSProperties) : undefined}
      className={cn(
        variant % 2 === 0 ? "sketch-box" : "sketch-box-alt",
        "bg-card p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

// A heading that looks written rather than set: slightly rotated, with a
// drawn underline beneath it.
export function SketchHeading({
  children,
  className,
  tilt = -1.2,
}: {
  children: ReactNode;
  className?: string;
  tilt?: number;
}) {
  return (
    <span
      style={{ display: "inline-block", transform: `rotate(${tilt}deg)` }}
      className={cn("sketch-underline", className)}
    >
      {children}
    </span>
  );
}

// Torn-paper tape, the kind used to stick a note to a fridge. Purely
// decorative, so it's hidden from assistive tech.
export function SketchTape({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 -rotate-2",
        "border border-foreground/25 bg-warm-surface/80",
        className,
      )}
      style={{ borderRadius: "6px 10px 6px 12px / 10px 6px 12px 6px" }}
    />
  );
}

// The stickfolk parade. Two rows running opposite ways so the strip has some
// life to it, and the labels are in the hand font so it reads as one drawing.
export function StickmanParade() {
  const row = STICK_CAST.map(({ Icon, label }) => (
    <span
      key={label}
      className="flex shrink-0 items-center gap-2 text-foreground/75"
    >
      <Icon className="size-9" title={label} />
      <span className="whitespace-nowrap text-sm">{label}</span>
    </span>
  ));

  return (
    <div className="relative flex flex-col gap-2 overflow-hidden py-1">
      <Marquee className="[--duration:38s]">{row}</Marquee>
      <Marquee reverse className="[--duration:46s]">
        {row}
      </Marquee>
      {/* Fade the ends so the loop doesn't visibly pop at the edges. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent"
      />
    </div>
  );
}
