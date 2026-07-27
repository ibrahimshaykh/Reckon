"use server";

import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { answerGroupQuestion } from "@/lib/gemini";
import { enforceRateLimit } from "@/lib/rate-limit";
import { validate, cuid, shortText } from "@/lib/validation";

export async function askGroupQuestion(
  groupId: string,
  question: string,
  history: { question: string; answer: string }[] = [],
) {
  const session = await requireSession();
  const validGroupId = validate(cuid, groupId);
  const validQuestion = validate(shortText("Question", 500), question);
  await assertMember(validGroupId, session.id);
  await enforceRateLimit(`ai-query:${session.id}`, 20, 60);

  const [expenses, chores, proposals, ious] = await Promise.all([
    db.expense.findMany({ where: { groupId: validGroupId }, include: { paidBy: true } }),
    db.chore.findMany({
      where: { groupId: validGroupId },
      include: {
        assignments: { orderBy: { periodStart: "desc" }, take: 1, include: { user: true } },
      },
    }),
    db.proposal.findMany({
      where: { groupId: validGroupId },
      include: { flags: { include: { user: true } } },
    }),
    db.iOU.findMany({
      where: { groupId: validGroupId, forgivenAt: null },
      include: { fromUser: true, toUser: true },
    }),
  ]);

  // Only the last few turns — enough for "what about last week"-style
  // follow-ups without growing the prompt unbounded.
  const recentHistory = history.slice(-5);

  const answer = await answerGroupQuestion(validQuestion, {
    today: new Date().toISOString().slice(0, 10),
    expenses: expenses.map((e) => ({
      title: e.title,
      totalAmount: Number(e.totalAmount),
      paidByName: e.paidBy.displayName,
      createdAt: e.createdAt.toISOString(),
    })),
    chores: chores.map((c) => ({
      name: c.name,
      currentAssignee: c.assignments[0]?.user.displayName ?? null,
      periodEnd: c.assignments[0]?.periodEnd.toISOString() ?? null,
    })),
    proposals: proposals.map((p) => ({
      title: p.title,
      status: p.status,
      estimatedCostPerPerson: p.estimatedCostPerPerson === null ? null : Number(p.estimatedCostPerPerson),
      dietaryTags: p.dietaryTags,
      flags: p.flags.map((f) => ({ userName: f.user.displayName, reason: f.reason, detail: f.detail })),
    })),
    ious: ious.map((i) => ({
      fromName: i.fromUser.displayName,
      toName: i.toUser.displayName,
      amount: Number(i.amount),
      note: i.note,
    })),
    history: recentHistory,
  });

  return {
    answer,
    sourceCounts: {
      expenses: expenses.length,
      chores: chores.length,
      proposals: proposals.length,
      ious: ious.length,
    },
  };
}
