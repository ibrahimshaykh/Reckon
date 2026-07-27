"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/dal";
import { fromCents } from "@/lib/money";
import { validate, latitude, longitude } from "@/lib/validation";
import { isLocale } from "@/lib/i18n";

const handle = z.string().trim().max(50).optional().or(z.literal(""));
const bankDetailsText = z.string().trim().max(300).optional().or(z.literal(""));

const updateProfileSchema = z.object({
  budgetLimitCents: z.number().int().min(0).nullable(),
  dietaryRestrictions: z.array(z.string().trim().max(50)).max(30),
  homeLatitude: latitude.nullable().optional(),
  homeLongitude: longitude.nullable().optional(),
  venmoHandle: handle,
  paypalHandle: handle,
  cashappHandle: handle,
  easypaisaNumber: handle,
  jazzcashNumber: handle,
  nayapayHandle: handle,
  bankDetails: bankDetailsText,
});

export async function updateProfile(input: {
  budgetLimitCents: number | null;
  dietaryRestrictions: string[];
  homeLatitude?: number | null;
  homeLongitude?: number | null;
  venmoHandle?: string;
  paypalHandle?: string;
  cashappHandle?: string;
  easypaisaNumber?: string;
  jazzcashNumber?: string;
  nayapayHandle?: string;
  bankDetails?: string;
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
      easypaisaNumber: valid.easypaisaNumber || null,
      jazzcashNumber: valid.jazzcashNumber || null,
      nayapayHandle: valid.nayapayHandle || null,
      bankDetails: valid.bankDetails || null,
    },
  });

  revalidatePath("/settings");
}

export async function updateUserLocale(locale: string) {
  const session = await requireSession();
  if (!isLocale(locale)) {
    throw new Error("Unsupported language.");
  }

  await db.user.update({ where: { id: session.id }, data: { locale } });
  // The nav (language-dependent) lives in the root layout, which wraps
  // every route — not just /settings.
  revalidatePath("/", "layout");
}
