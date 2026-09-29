import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertMember } from "@/lib/actions/groups";
import { getSession } from "@/lib/dal";
import { answerGroupQuestionStream } from "@/lib/gemini";
import { enforceRateLimit } from "@/lib/rate-limit";
import { validate, cuid, shortText } from "@/lib/validation";
import { ApiError } from "@/lib/api-error";
import { z } from "zod";

// A Route Handler rather than a Server Action specifically because a Server
// Action's return value is one JSON payload, sent only once the whole thing
// resolves — there is no way to stream partial results out of one. This
// mirrors askGroupQuestion's own auth, validation and data-gathering, then
// answers the same question through answerGroupQuestionStream instead of
// answerGroupQuestion, writing each chunk to the response as it arrives.
const bodySchema = z.object({
  question: shortText("Question", 500),
  history: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .default([]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await params;
    const validGroupId = validate(cuid, groupId);

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const { question, history } = validate(bodySchema, await request.json());
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

    const sourceCounts = {
      expenses: expenses.length,
      chores: chores.length,
      proposals: proposals.length,
      ious: ious.length,
    };

    const answerGen = answerGroupQuestionStream(question, {
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
      // Same window askGroupQuestion used — enough for a follow-up like
      // "what about last week" without growing the prompt unbounded.
      history: history.slice(-5),
    });

    // The generator's retry logic (withAiRetry, inside answerGroupQuestionStream)
    // runs on this first call. Anything it throws happens before a single byte
    // has reached the browser, so a real HTTP error status is still honest here
    // — the moment the loop below starts, that's no longer true, and a failure
    // there can only end the stream quietly rather than change its status.
    let first: IteratorResult<string>;
    try {
      first = await answerGen.next();
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        if (!first.done) controller.enqueue(encoder.encode(first.value));
        try {
          for await (const chunk of answerGen) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch {
          // A chunk has already reached the client at this point, so the
          // only honest option left is to end the stream where it stands.
        } finally {
          controller.close();
        }
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Source-Counts": JSON.stringify(sourceCounts),
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
