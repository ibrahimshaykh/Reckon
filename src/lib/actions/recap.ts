"use server";

import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { requireSession } from "@/lib/dal";
import { generateMonthlyRecap } from "@/lib/gemini";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { Recap } from "@/generated/prisma/client";
import { asActionResult, type ActionResult } from "@/lib/action-result";

type TopExpense = { title: string; amount: number };

function mapRecap(recap: Recap, previousTotalSpentCents: number | null) {
  return {
    summaryText: recap.summaryText,
    totalSpentCents: recap.totalSpentCents,
    topExpenses: recap.topExpenses as TopExpense[],
    choresCompleted: recap.choresCompleted,
    proposalsDecided: recap.proposalsDecided,
    choreMvpName: recap.choreMvpName,
    bigSpenderName: recap.bigSpenderName,
    previousTotalSpentCents,
  };
}

async function getPreviousTotal(groupId: string, monthStart: Date) {
  const prevMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
  const prev = await db.recap.findUnique({
    where: { groupId_month: { groupId, month: prevMonthStart } },
  });
  return prev?.totalSpentCents ?? null;
}

export async function getMonthlyRecap(
  groupId: string,
): Promise<ActionResult<ReturnType<typeof mapRecap>>> {
  return asActionResult(async () => {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Already generated this month — return the saved snapshot rather than
  // re-spending an AI call and risking a different answer on every refresh.
  const existing = await db.recap.findUnique({
    where: { groupId_month: { groupId, month: monthStart } },
  });
  if (existing) return mapRecap(existing, await getPreviousTotal(groupId, monthStart));

  await enforceRateLimit(`recap:${session.id}`, 5, 60);

  const [expenses, completedAssignments, decidedProposals] = await Promise.all([
    db.expense.findMany({
      where: { groupId, createdAt: { gte: monthStart } },
      include: { paidBy: true },
    }),
    db.choreAssignment.findMany({
      where: { chore: { groupId }, completedAt: { gte: monthStart, not: null } },
      include: { chore: true, user: true },
    }),
    db.proposal.count({
      where: { groupId, status: { not: "PROPOSED" }, createdAt: { gte: monthStart } },
    }),
  ]);

  const totalSpentCents = Math.round(expenses.reduce((sum, e) => sum + Number(e.totalAmount) * 100, 0));
  const topExpenses: TopExpense[] = expenses
    .sort((a, b) => Number(b.totalAmount) - Number(a.totalAmount))
    .slice(0, 3)
    .map((e) => ({ title: e.title, amount: Number(e.totalAmount) }));

  // Big Spender: whoever fronted the most expense value this month.
  const spendByUser = new Map<string, { name: string; total: number }>();
  for (const e of expenses) {
    const entry = spendByUser.get(e.paidById) ?? { name: e.paidBy.displayName, total: 0 };
    entry.total += Number(e.totalAmount);
    spendByUser.set(e.paidById, entry);
  }
  const bigSpender = [...spendByUser.values()].sort((a, b) => b.total - a.total)[0] ?? null;

  // Chore MVP: whoever completed the most effort-weight this month.
  const effortByUser = new Map<string, { name: string; total: number }>();
  for (const a of completedAssignments) {
    const entry = effortByUser.get(a.userId) ?? { name: a.user.displayName, total: 0 };
    entry.total += a.chore.effortWeight;
    effortByUser.set(a.userId, entry);
  }
  const choreMvp = [...effortByUser.values()].sort((a, b) => b.total - a.total)[0] ?? null;

  const summaryText = await generateMonthlyRecap({
    month: now.toLocaleString("en-US", { month: "long", year: "numeric" }),
    totalSpentCents,
    topExpenses,
    choresCompleted: completedAssignments.length,
    proposalsDecided: decidedProposals,
  });

  const created = await db.recap.upsert({
    where: { groupId_month: { groupId, month: monthStart } },
    update: {},
    create: {
      groupId,
      month: monthStart,
      summaryText,
      totalSpentCents,
      choresCompleted: completedAssignments.length,
      proposalsDecided: decidedProposals,
      topExpenses,
      choreMvpName: choreMvp?.name ?? null,
      bigSpenderName: bigSpender?.name ?? null,
    },
  });

  return mapRecap(created, await getPreviousTotal(groupId, monthStart));
  });
}

export async function listPastRecaps(groupId: string) {
  const session = await requireSession();
  await assertMember(groupId, session.id);

  const recaps = await db.recap.findMany({ where: { groupId }, orderBy: { month: "desc" } });

  return recaps.map((r) => ({
    month: r.month.toLocaleString("en-US", { month: "long", year: "numeric" }),
    totalSpentCents: r.totalSpentCents,
  }));
}
