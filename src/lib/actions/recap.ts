"use server";

import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { generateMonthlyRecap } from "@/lib/gemini";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function getMonthlyRecap(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);
  await enforceRateLimit(`recap:${session.id}`, 5, 60);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [expenses, completedChores, decidedProposals] = await Promise.all([
    db.expense.findMany({ where: { groupId, createdAt: { gte: monthStart } } }),
    db.choreAssignment.count({
      where: { chore: { groupId }, completedAt: { gte: monthStart, not: null } },
    }),
    db.proposal.count({
      where: { groupId, status: { not: "PROPOSED" }, createdAt: { gte: monthStart } },
    }),
  ]);

  const totalSpentCents = expenses.reduce((sum, e) => sum + Number(e.totalAmount) * 100, 0);
  const topExpenses = expenses
    .sort((a, b) => Number(b.totalAmount) - Number(a.totalAmount))
    .slice(0, 3)
    .map((e) => ({ title: e.title, amount: Number(e.totalAmount) }));

  return generateMonthlyRecap({
    month: now.toLocaleString("default", { month: "long", year: "numeric" }),
    totalSpentCents,
    topExpenses,
    choresCompleted: completedChores,
    proposalsDecided: decidedProposals,
  });
}
