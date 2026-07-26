import "server-only";
import { randomBytes } from "crypto";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-error";

export async function getSession() {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  const displayName = clerkUser.fullName ?? email;

  try {
    return await db.user.upsert({
      where: { clerkId: clerkUser.id },
      update: { email, displayName, avatarUrl: clerkUser.imageUrl },
      create: {
        clerkId: clerkUser.id,
        email,
        displayName,
        avatarUrl: clerkUser.imageUrl,
      },
    });
  } catch (error) {
    // Concurrent first requests can both miss the upsert's own conflict
    // target (clerkId) and race on the email unique index instead — the
    // loser just re-reads what the winner created.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await db.user.findUnique({
        where: { clerkId: clerkUser.id },
      });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new ApiError(401, "Not signed in");
  return session;
}

export function generateGuestToken() {
  return randomBytes(24).toString("base64url");
}

export async function getGuestSession(token: string) {
  const guestToken = await db.guestToken.findUnique({ where: { token } });
  if (!guestToken || guestToken.expiresAt < new Date()) return null;
  return guestToken;
}

export async function getConfirmToken(token: string) {
  const settlement = await db.settlement.findUnique({ where: { confirmToken: token } });
  if (!settlement || !settlement.confirmTokenExpiresAt || settlement.confirmTokenExpiresAt < new Date()) {
    return null;
  }
  return settlement;
}
