import { Safepay } from "@sfpy/node-sdk";
import { logger } from "@/lib/logger";

// The SDK's Environment enum isn't re-exported from the package root, so
// this derives the param type from the public Safepay constructor instead
// of reaching into the package's internal module paths.
type SafepayEnvironment = ConstructorParameters<typeof Safepay>[0]["environment"];

let client: Safepay | null | undefined;
let warned = false;

// Sandbox is free and self-serve (no card, no business docs) — this is
// unconfigured until SAFEPAY_API_KEY etc. are added, at which point the
// card/EasyPaisa/JazzCash pay button on the settle page starts appearing.
export function getSafepayClient(): Safepay | null {
  if (client !== undefined) return client;

  const apiKey = process.env.SAFEPAY_API_KEY;
  const v1Secret = process.env.SAFEPAY_V1_SECRET;
  const webhookSecret = process.env.SAFEPAY_WEBHOOK_SECRET;

  if (!apiKey || !v1Secret || !webhookSecret) {
    if (!warned) {
      logger.warn("Safepay not configured — card/EasyPaisa/JazzCash pay button disabled (degrade-open).");
      warned = true;
    }
    client = null;
    return null;
  }

  client = new Safepay({
    environment: (process.env.SAFEPAY_ENVIRONMENT === "production"
      ? "production"
      : "sandbox") as SafepayEnvironment,
    apiKey,
    v1Secret,
    webhookSecret,
  });
  return client;
}
