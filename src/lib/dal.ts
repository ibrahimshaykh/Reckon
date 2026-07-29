import "server-only";
import { randomBytes } from "crypto";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

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

// Signed-out visitors get sent to sign-in, not an error page. Throwing here
// surfaced as a 500 "Something went wrong on our end" — so an expired session,
// or simply opening a shared /groups link while logged out, looked like the
// app was broken rather than like it wanted you to sign in.
//
// redirect() works by throwing NEXT_REDIRECT. That's deliberately NOT an
// ApiError, so asActionResult() re-throws it untouched and the redirect still
// happens when this is called from inside a Server Action.
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
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
