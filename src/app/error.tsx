"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-3 p-12 text-center">
      <h1 className="text-lg font-semibold">Something went wrong on our end.</h1>
      <p className="text-sm text-muted-foreground">
        That&apos;s on us, not you — give it another try.
      </p>
      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
