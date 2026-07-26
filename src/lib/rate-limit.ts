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

// Enforces a per-key limit on abusable/expensive actions (AI calls, uploads).
// When Upstash isn't configured the call is a no-op — the app stays usable in
// dev and only gains protection once keys exist, matching the Resend-nudge
// degrade-open pattern established earlier.
export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const limiter = getLimiter(limit, windowSeconds);
  if (!limiter) return;

  const { success } = await limiter.limit(key);
  if (!success) {
    throw new ApiError(429, "You're doing that too fast — give it a moment and try again.");
  }
}
