import type { ReactNode } from "react";

// Editorial page header used across every screen: a small mono eyebrow that
// names the context the page sits in, a display-face title, and an optional
// line explaining what the page computes.
export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-3">
        {eyebrow && (
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-4xl font-semibold md:text-5xl">{title}</h1>
        {description && (
          <p className="max-w-prose text-[0.9375rem] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
        {meta}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

// A quieter heading for sections nested inside a page.
export function SectionHeading({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-rule pb-2">
      <h2 className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
        {children}
      </h2>
      {action}
    </div>
  );
}
