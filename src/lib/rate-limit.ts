import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const limiters = new Map<string, Ratelimit>();
let warned = false;

function getLimiter(limit: number, windowSeconds: number): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    if (!warned) {
      logger.warn("Upstash not configured — rate limiting is disabled (degrade-open).");
      warned = true;
    }
    return null;
  }

  const cacheKey = `${limit}:${windowSeconds}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      analytics: false,
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

let warnedUnreachable = false;

// Enforces a per-key limit on abusable/expensive actions (AI calls, uploads).
// When Upstash isn't configured OR is unreachable/misconfigured, the call is a
// no-op — the app stays usable in dev and degrades open rather than taking
// down every rate-limited feature if Upstash has an outage or a bad token.
export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const limiter = getLimiter(limit, windowSeconds);
  if (!limiter) return;

  let success: boolean;
  try {
    ({ success } = await limiter.limit(key));
  } catch (error) {
    if (!warnedUnreachable) {
      logger.warn("Upstash rate-limit call failed — degrading open (allowing the request).", {
        error: error instanceof Error ? error.message : String(error),
      });
      warnedUnreachable = true;
    }
    return;
  }

  if (!success) {
    throw new ApiError(429, "You're doing that too fast — give it a moment and try again.");
  }
}
