import { describe, expect, it } from "vitest";
import { isQuotaExhaustedError, isTransientAiError } from "@/lib/gemini";

// Captured verbatim from live failures while running the Ask eval — Gemini
// puts the whole payload in the Error message rather than structured fields,
// so these classifiers are string matching and need real samples to trust.
const QUOTA_ERROR = new Error(
  '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details.' +
    "\\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, " +
    'limit: 20, model: gemini-3.5-flash","status":"RESOURCE_EXHAUSTED"}}',
);

const OVERLOADED_ERROR = new Error(
  '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are ' +
    'usually temporary. Please try again later.","status":"UNAVAILABLE"}}',
);

describe("AI error classification", () => {
  it("recognises the daily free-tier cap", () => {
    expect(isQuotaExhaustedError(QUOTA_ERROR)).toBe(true);
    expect(isTransientAiError(QUOTA_ERROR)).toBe(false);
  });

  it("recognises a temporarily overloaded model", () => {
    expect(isTransientAiError(OVERLOADED_ERROR)).toBe(true);
    expect(isQuotaExhaustedError(OVERLOADED_ERROR)).toBe(false);
  });

  it("leaves unrelated failures alone so they aren't retried or excused", () => {
    const other = new Error("getaddrinfo ENOTFOUND generativelanguage.googleapis.com");
    expect(isTransientAiError(other)).toBe(false);
    expect(isQuotaExhaustedError(other)).toBe(false);
  });

  it("handles non-Error throws without blowing up", () => {
    expect(isQuotaExhaustedError("RESOURCE_EXHAUSTED")).toBe(true);
    expect(isTransientAiError(null)).toBe(false);
    expect(isQuotaExhaustedError(undefined)).toBe(false);
  });
});
