"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession, generateGuestToken } from "@/lib/dal";
import { validate, cuid, shortText } from "@/lib/validation";

const createGuestLinkSchema = z.object({
  expenseId: cuid,
  guestName: shortText("Name", 100),
  guestEmail: z.string().trim().email().optional().or(z.literal("")),
});

export async function createGuestLink(input: {
  expenseId: string;
  guestName: string;
  guestEmail?: string;
}) {
  await requireSession();
  const valid = validate(createGuestLinkSchema, input);

  const token = generateGuestToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.guestToken.create({
    data: {
      token,
      expenseId: valid.expenseId,
      guestName: valid.guestName,
      guestEmail: valid.guestEmail || undefined,
      expiresAt,
    },
  });

  return `/guest/${token}`;
}
