"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import { validate, cuid } from "@/lib/validation";
import { findGroupFreeTime } from "@/lib/availability";

const addAvailabilitySchema = z.object({
  groupId: cuid,
  startsAt: z.string().min(1, "Start time is required."),
  endsAt: z.string().min(1, "End time is required."),
  label: z.string().trim().max(200).optional(),
});

export async function addAvailability(input: {
  groupId: string;
  startsAt: string;
  endsAt: string;
  label?: string;
}) {
  const session = await requireSession();
  const valid = validate(addAvailabilitySchema, input);
  await assertMember(valid.groupId, session.id);

  const startsAt = new Date(valid.startsAt);
  const endsAt = new Date(valid.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new ApiError(400, "Enter valid start and end times.");
  }
  if (endsAt <= startsAt) {
    throw new ApiError(400, "End time must be after start time.");
  }

  await db.availabilityEntry.create({
    data: {
      groupId: valid.groupId,
      userId: session.id,
      startsAt,
      endsAt,
      label: valid.label,
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
    entries: entries.map((e) => ({
      id: e.id,
      userId: e.userId,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      label: e.label,
    })),
  };
}

export async function removeAvailability(entryId: string) {
  const session = await requireSession();
  const entry = await db.availabilityEntry.findUniqueOrThrow({ where: { id: entryId } });
  if (entry.userId !== session.id) {
    throw new ApiError(403, "You can only remove your own availability.");
  }
  await db.availabilityEntry.delete({ where: { id: entryId } });
  revalidatePath(`/groups/${entry.groupId}/availability`);
}
