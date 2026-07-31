"use client";

import { useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Dictionary } from "@/lib/dictionary";

type Guide = {
  intro: string;
  fields: { name: string; what: string; example: string }[];
};

// Explains every field on a screen, in plain words, with something you could
// actually type. The app assumed you already knew what it meant — the chores
// form asks for a number between 1 and 5 and never says it's how heavy the
// job is, which is unguessable if nobody tells you.
//
// Collapsed by default so it stays out of the way once you've read it, and
// sits above the form rather than in a tooltip, because a tooltip you have to
// hover to find is no use to someone who doesn't know what to look for.
export function FieldGuide({ guide, dict }: { guide: Guide; dict: Dictionary }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 self-start text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
      >
        <HelpCircle className="size-3.5" />
        {open ? dict.guides.closeLabel : dict.guides.openLabel}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="relative rounded-lg border border-rule bg-card p-4 pe-9">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={dict.guides.closeLabel}
                className="absolute end-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>

              <p className="mb-3 text-xs text-muted-foreground">{guide.intro}</p>

              <dl className="flex flex-col gap-3">
                {guide.fields.map((field) => (
                  <div key={field.name} className="flex flex-col gap-0.5">
                    <dt className="text-xs font-semibold">{field.name}</dt>
                    <dd className="text-xs leading-relaxed text-muted-foreground">
                      {field.what}
                      {/* A worked example does more than another sentence of
                          description — it shows the shape of the answer. */}
                      <span className="mt-0.5 block font-mono text-[0.7rem] text-foreground/70">
                        {dict.guides.exampleLabel}: {field.example}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
