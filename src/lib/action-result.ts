import { ApiError } from "@/lib/api-error";

// Next.js redacts thrown Error messages from Server Actions in production —
// only a digest reaches the client, never the text. Confirmed against this
// app's own deployed build: an ApiError with a clear, safe message ("No
// Reckon account with that email yet") arrived in the browser as Next's
// generic "error occurred in the Server Components render" wall of text.
// This project's own docs (node_modules/next/dist/docs/.../error-handling.md)
// say exactly why: "avoid try/catch and throw errors [for expected errors].
// Instead, model expected errors as return values."
//
// ApiError instances ARE the expected, user-facing case (validation, "already
// a member", "not your turn to pay") — so they're caught here and turned into
// a plain returned object instead of a thrown exception. Anything that is NOT
// an ApiError is a genuine bug, and stays thrown so Next's redaction (rightly)
// keeps its details off the client.
export type ActionResult<T> = T | { error: string };

export function isActionError<T>(result: ActionResult<T>): result is { error: string } {
  return typeof result === "object" && result !== null && "error" in result;
}

export async function asActionResult<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
}
