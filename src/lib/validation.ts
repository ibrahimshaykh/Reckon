import { z } from "zod";
import { ApiError } from "@/lib/api-error";

export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, result.error.issues[0]?.message ?? "Invalid input.");
  }
  return result.data;
}

export const cuid = z.string().min(1, "Required.");
export const positiveCents = z.number().int().positive("Amount must be positive.");
export const nonNegativeCents = z.number().int().min(0);
export const latitude = z.number().min(-90).max(90);
export const longitude = z.number().min(-180).max(180);
export const shortText = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);
export const optionalText = (max = 500) => z.string().trim().max(max).optional();
