"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-3 p-12 text-center">
          <h1 className="text-lg font-semibold">Something went wrong on our end.</h1>
          <p className="text-sm text-muted-foreground">
            That&apos;s on us, not you — give it another try.
          </p>
          <button
            onClick={() => reset()}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
