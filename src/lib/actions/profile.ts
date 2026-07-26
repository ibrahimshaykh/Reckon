"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/dal";
import { fromCents } from "@/lib/money";

export async function updateProfile(input: {
  budgetLimitCents: number | null;
  dietaryRestrictions: string[];
  homeLatitude?: number | null;
  homeLongitude?: number | null;
}) {
  const session = await requireSession();

  await db.user.update({
    where: { id: session.id },
    data: {
      budgetLimit:
        input.budgetLimitCents === null ? null : fromCents(input.budgetLimitCents),
      dietaryRestrictions: input.dietaryRestrictions,
      ...(input.homeLatitude !== undefined && { homeLatitude: input.homeLatitude }),
      ...(input.homeLongitude !== undefined && { homeLongitude: input.homeLongitude }),
    },
  });

  revalidatePath("/settings");
}
