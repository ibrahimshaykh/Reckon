"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";

export async function createGroup(name: string) {
  const session = await requireSession();
  if (!name.trim()) throw new ApiError(400, "Group name is required.");

  const group = await db.group.create({
    data: {
      name: name.trim(),
      createdById: session.id,
      members: { create: { userId: session.id } },
    },
  });

  revalidatePath("/groups");
  return { id: group.id, name: group.name };
}

export async function addMemberByEmail(groupId: string, email: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const user = await db.user.findUnique({ where: { email: email.trim() } });
  if (!user) {
    throw new ApiError(
      404,
      "No Reckon account with that email yet — ask them to sign up first.",
    );
  }

  const existing = await db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
  });
  if (existing) throw new ApiError(409, "Already a member of this group.");

  await db.groupMember.create({ data: { groupId, userId: user.id } });
  revalidatePath(`/groups/${groupId}`);
  return { id: user.id, displayName: user.displayName, email: user.email };
}

export async function listMyGroups() {
  const session = await requireSession();
  const memberships = await db.groupMember.findMany({
    where: { userId: session.id },
    include: { group: true },
    orderBy: { group: { createdAt: "desc" } },
  });
  return memberships.map((m) => ({ id: m.group.id, name: m.group.name }));
}

export async function getGroup(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const group = await db.group.findUniqueOrThrow({
    where: { id: groupId },
    include: { members: { include: { user: true } } },
  });

  return {
    id: group.id,
    name: group.name,
    members: group.members.map((m) => ({
      id: m.user.id,
      displayName: m.user.displayName,
      email: m.user.email,
    })),
  };
}

export async function assertMember(groupId: string, userId: string) {
  const membership = await db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) throw new ApiError(403, "Not a member of this group.");
}
