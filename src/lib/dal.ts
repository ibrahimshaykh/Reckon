import "server-only";
import { randomBytes } from "crypto";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { decideAdoption } from "@/lib/account-linking";

export async function getSession() {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const primaryEmail = clerkUser.emailAddresses[0];
  const email = primaryEmail?.emailAddress;
  if (!email) return null;

  const displayName = clerkUser.fullName ?? email;
  const profile = { email, displayName, avatarUrl: clerkUser.imageUrl };

  try {
    return await db.user.upsert({
      where: { clerkId: clerkUser.id },
      update: profile,
      create: { clerkId: clerkUser.id, ...profile },
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }

    // Concurrent first requests can both miss the upsert's own conflict
    // target (clerkId) and race on the email unique index instead — the
    // loser just re-reads what the winner created.
    const byClerkId = await db.user.findUnique({
      where: { clerkId: clerkUser.id },
    });
    if (byClerkId) return byClerkId;

    // Otherwise the email belongs to an account created under a different
    // Clerk id — the same person arriving through a second OAuth provider, or
    // after recreating their login. Their row and everything hanging off it is
    // intact; only the key onto it has changed. This used to rethrow, which
    // meant a 500 on sign-in and an account nobody could reach again.
    const byEmail = await db.user.findUnique({ where: { email } });
    const decision = decideAdoption({
      ownerClerkId: byEmail?.clerkId ?? null,
      incomingClerkId: clerkUser.id,
      emailVerified: primaryEmail.verification?.status === "verified",
    });
    if (!byEmail || decision !== "adopt") throw error;

    // Conditional on the clerkId we read, so two sign-ins racing to claim the
    // same row can't both believe they won.
    const claimed = await db.user.updateMany({
      where: { id: byEmail.id, clerkId: byEmail.clerkId },
      data: { clerkId: clerkUser.id, ...profile },
    });
    if (claimed.count === 0) {
      const winner = await db.user.findUnique({
        where: { clerkId: clerkUser.id },
      });
      if (winner) return winner;
      throw error;
    }

    return await db.user.findUniqueOrThrow({ where: { id: byEmail.id } });
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

export async function getConfirmToken(token: string) {
  const settlement = await db.settlement.findUnique({ where: { confirmToken: token } });
  if (!settlement || !settlement.confirmTokenExpiresAt || settlement.confirmTokenExpiresAt < new Date()) {
    return null;
  }
  return settlement;
}
