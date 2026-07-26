"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import { findGroupFreeTime } from "@/lib/availability";

export async function addAvailability(input: {
  groupId: string;
  startsAt: string;
  endsAt: string;
  label?: string;
}) {
  const session = await requireSession();
  await assertMember(input.groupId, session.id);

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (endsAt <= startsAt) {
    throw new ApiError(400, "End time must be after start time.");
  }

  await db.availabilityEntry.create({
    data: {
      groupId: input.groupId,
      userId: session.id,
      startsAt,
      endsAt,
      label: input.label,
    },
  });

  revalidatePath(`/groups/${input.groupId}/availability`);
}

export async function getGroupFreeTime(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const entries = await db.availabilityEntry.findMany({
    where: { groupId },
    include: { user: true },
  });

  const entriesByUser: Record<string, { start: number; end: number }[]> = {};
  for (const entry of entries) {
    (entriesByUser[entry.userId] ??= []).push({
      start: entry.startsAt.getTime(),
      end: entry.endsAt.getTime(),
    });
  }

  const respondedCount = Object.keys(entriesByUser).length;
  const freeWindows = findGroupFreeTime(entriesByUser);

  return {
    respondedCount,
    windows: freeWindows.map((w) => ({
      startsAt: new Date(w.start).toISOString(),
      endsAt: new Date(w.end).toISOString(),
    })),
  };
}
