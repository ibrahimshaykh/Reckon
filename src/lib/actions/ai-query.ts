"use server";

import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { answerGroupQuestion, getCapabilityPrimer } from "@/lib/gemini";
import { enforceRateLimit } from "@/lib/rate-limit";

export { getCapabilityPrimer };

export async function askGroupQuestion(groupId: string, question: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);
  await enforceRateLimit(`ai-query:${session.id}`, 20, 60);

  const [expenses, chores] = await Promise.all([
    db.expense.findMany({ where: { groupId }, include: { paidBy: true } }),
    db.chore.findMany({
      where: { groupId },
      include: {
        assignments: { orderBy: { periodStart: "desc" }, take: 1, include: { user: true } },
      },
    }),
  ]);

  const answer = await answerGroupQuestion(question, {
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
  });

  return answer;
}
