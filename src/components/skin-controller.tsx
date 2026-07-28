"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PencilCursor } from "@/components/sketch/pencil-cursor";
import { DoodleBackdrop } from "@/components/sketch/doodle-backdrop";
import { LivingBackground } from "@/components/sketch/living-background";
import { PageWrapper } from "@/components/sketch/page-wrapper";

// The landing page keeps the polished violet identity that sells the product;
// everything behind the sign-in gets the hand-drawn skin. Setting the flag on
// <html> means the whole tree switches at once — header, nav and page — rather
// than each component having to know which skin it's in.
export function SkinController() {
  const pathname = usePathname();
  const sketch = pathname !== "/";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.skin = sketch ? "sketch" : "plain";
    setMounted(true);
  }, [sketch]);

  // The cursor and backdrop are pure decoration and touch window/pointer APIs,
  // so they only mount client-side, and only where the doodle skin is on.
  if (!mounted || !sketch) return null;

  return (
    <>
      {/* Paper, rules and ambient scribbles — the sheet itself. */}
      <DoodleBackdrop />
      {/* The HUD drawn on that sheet: where you've been, what you've kept. */}
      <PageWrapper />
      <LivingBackground />
      <PencilCursor />
    </>
  );
}
