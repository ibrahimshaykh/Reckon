"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import type { Dictionary } from "@/lib/dictionary";

// Group-scoped navigation only appears once you're inside a group, since
// every one of these routes needs a group id to mean anything.
function useGroupId() {
  const pathname = usePathname();
  const match = pathname.match(/^\/groups\/([^/]+)/);
  const id = match?.[1];
  return id && id !== "new" ? id : null;
}

export function AppNav({ dict }: { dict: Dictionary }) {
  const pathname = usePathname();
  const groupId = useGroupId();

  const links = groupId
    ? [
        { href: `/groups/${groupId}`, label: dict.groupHub.expenses, exact: true },
        { href: `/groups/${groupId}/settle`, label: dict.groupHub.whoOwesWho },
        // Money first: expenses, who owes who, then IOUs, since an IOU is
        // the same question as "who owes who" by another route. The household
        // sections follow.
        { href: `/groups/${groupId}/ious`, label: dict.groupHub.ious },
        { href: `/groups/${groupId}/chores`, label: dict.groupHub.chores },
        { href: `/groups/${groupId}/availability`, label: dict.groupHub.availability },
        { href: `/groups/${groupId}/proposals`, label: dict.groupHub.proposals },
        { href: `/groups/${groupId}/ask`, label: dict.groupHub.askAi },
        { href: `/groups/${groupId}/recap`, label: dict.groupHub.monthlyRecap },
      ]
    : [{ href: "/groups", label: dict.groupHub.yourGroups, exact: true }];

  return (
    <nav className="-mx-1 flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {groupId && (
        <Link
          href="/groups"
          className="shrink-0 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← {dict.groupHub.yourGroups}
        </Link>
      )}
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`relative shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors ${
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {active && (
              <motion.span
                layoutId="nav-pill"
                className="absolute inset-0 -z-10 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
