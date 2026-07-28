import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Magic UI's Marquee pattern: the children are rendered twice and the track
// slides exactly one copy's width, so the loop is seamless without measuring
// anything in JS. Kept as pure CSS so it costs nothing on the server render.
export function Marquee({
  children,
  reverse,
  pauseOnHover = true,
  className,
  repeat = 2,
}: {
  children: ReactNode;
  reverse?: boolean;
  pauseOnHover?: boolean;
  className?: string;
  repeat?: number;
}) {
  return (
    <div
      className={cn(
        "group/marquee flex w-full overflow-hidden [--duration:32s] [--gap:2.5rem] [gap:var(--gap)]",
        className,
      )}
    >
      {Array.from({ length: repeat }, (_, i) => (
        <div
          key={i}
          aria-hidden={i > 0}
          className={cn(
            "flex shrink-0 justify-around [gap:var(--gap)] motion-safe:animate-marquee",
            reverse && "[animation-direction:reverse]",
            pauseOnHover && "group-hover/marquee:[animation-play-state:paused]",
          )}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
