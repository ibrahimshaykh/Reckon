"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/dal";
import { fromCents } from "@/lib/money";
import { validate, latitude, longitude } from "@/lib/validation";

const handle = z.string().trim().max(50).optional().or(z.literal(""));

const updateProfileSchema = z.object({
  budgetLimitCents: z.number().int().min(0).nullable(),
  dietaryRestrictions: z.array(z.string().trim().max(50)).max(30),
  homeLatitude: latitude.nullable().optional(),
  homeLongitude: longitude.nullable().optional(),
  venmoHandle: handle,
  paypalHandle: handle,
  cashappHandle: handle,
});

export async function updateProfile(input: {
  budgetLimitCents: number | null;
  dietaryRestrictions: string[];
  homeLatitude?: number | null;
  homeLongitude?: number | null;
  venmoHandle?: string;
  paypalHandle?: string;
  cashappHandle?: string;
}) {
  const session = await requireSession();
  const valid = validate(updateProfileSchema, input);

  await db.user.update({
    where: { id: session.id },
    data: {
      budgetLimit:
        valid.budgetLimitCents === null ? null : fromCents(valid.budgetLimitCents),
      dietaryRestrictions: valid.dietaryRestrictions,
      ...(valid.homeLatitude !== undefined && { homeLatitude: valid.homeLatitude }),
      ...(valid.homeLongitude !== undefined && { homeLongitude: valid.homeLongitude }),
      venmoHandle: valid.venmoHandle || null,
      paypalHandle: valid.paypalHandle || null,
      cashappHandle: valid.cashappHandle || null,
    },
  });

  revalidatePath("/settings");
}
