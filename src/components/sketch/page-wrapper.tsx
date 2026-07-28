"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSketchpad } from "@/lib/stores/sketchpad";

// Route segments are ugly (`ious`, cuids). This turns a path into something a
// person would actually write in a margin.
const SEGMENT_LABELS: Record<string, string> = {
  groups: "My groups",
  settle: "Who owes who",
  chores: "Chores",
  availability: "Free time",
  ious: "IOUs",
  proposals: "Plans",
  ask: "Ask Reckon",
  recap: "Recap",
  expenses: "Expenses",
  new: "New",
  settings: "Settings",
  friends: "Friend",
  guest: "Guest link",
  confirm: "Confirm",
};

const CUID = /^c[a-z0-9]{20,}$/i;

function describe(pathname: string): { label: string; section: string } {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return { label: "Home", section: "home" };

  // Ids carry no meaning to a reader, so the last *named* segment wins.
  const named = parts.filter((p) => !CUID.test(p) && !/^\d+$/.test(p));
  const last = named.at(-1) ?? parts.at(-1)!;

  return {
    label: SEGMENT_LABELS[last] ?? last.replace(/-/g, " "),
    // The section is the first segment — changing it is what triggers a page
    // turn, so moving between groups doesn't tear the page but going from a
    // group to Settings does.
    section: parts[0],
  };
}

/**
 * Watches the router and tells the background where the reader has got to.
 * Renders nothing itself — the drawing all happens in LivingBackground.
 */
export function PageWrapper() {
  const pathname = usePathname();
  const visitRoute = useSketchpad((s) => s.visitRoute);

  useEffect(() => {
    if (!pathname) return;
    const { label, section } = describe(pathname);
    visitRoute(pathname, label, section);
  }, [pathname, visitRoute]);

  return null;
}
