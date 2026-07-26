"use server";

import { db } from "@/lib/db";
import { requireSession, generateGuestToken } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";

export async function createGuestLink(input: {
  expenseId: string;
  guestName: string;
  guestEmail?: string;
}) {
  await requireSession();
  if (!input.guestName.trim()) throw new ApiError(400, "A name is required.");

  const token = generateGuestToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.guestToken.create({
    data: {
      token,
      expenseId: input.expenseId,
      guestName: input.guestName.trim(),
      guestEmail: input.guestEmail,
      expiresAt,
    },
  });

  return `/guest/${token}`;
}
