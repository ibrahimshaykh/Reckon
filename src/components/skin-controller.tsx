"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PencilCursor } from "@/components/sketch/pencil-cursor";
import { DoodleBackdrop } from "@/components/sketch/doodle-backdrop";
import { LivingBackground } from "@/components/sketch/living-background";
import { PageWrapper } from "@/components/sketch/page-wrapper";

// The whole product is a shared paper notebook, so the front door is one too.
//
// The landing page used to keep a separate polished identity on the theory
// that it sold the product better. It sold a different product: a visitor met
// a glossy fintech page, signed up, and landed in a hand-drawn notebook with
// nothing in common with what they had just been shown. The promise and the
// thing now match.
//
// The HUD stays behind the login. The margin scribble and the living
// background are about where you have been in the app, which means nothing to
// somebody who has not been anywhere yet.
export function SkinController() {
  const pathname = usePathname();
  const insideApp = pathname !== "/";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.skin = "sketch";
    setMounted(true);
  }, []);

  // Touch window and pointer APIs, so client-only.
  if (!mounted) return null;

  return (
    <>
      {/* Paper, rules and ambient scribbles — the sheet itself. */}
      <DoodleBackdrop />
      <PencilCursor />
      {insideApp && (
        <>
          <PageWrapper />
          <LivingBackground />
        </>
      )}
    </>
  );
}
