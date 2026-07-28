"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// The landing page keeps the polished violet identity that sells the product;
// everything behind the sign-in gets the hand-drawn skin. Setting the flag on
// <html> means the whole tree switches at once — header, nav and page — rather
// than each component having to know which skin it's in.
export function SkinController() {
  const pathname = usePathname();

  useEffect(() => {
    const marketing = pathname === "/";
    document.documentElement.dataset.skin = marketing ? "plain" : "sketch";
  }, [pathname]);

  return null;
}
