import {
  GoogleGenAI,
  Type,
  createUserContent,
  createPartFromBase64,
} from "@google/genai";
import { ApiError } from "@/lib/api-error";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Gemini reports failures as a JSON blob inside the Error message rather than
// structured fields, so both classifiers read the raw text.
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// 503/UNAVAILABLE means the model is momentarily oversubscribed — the same
// request usually succeeds a second later, so it's worth retrying.
export function isTransientAiError(error: unknown): boolean {
  const text = errorText(error);
  return text.includes('"code":503') || text.includes("UNAVAILABLE");
}

// 429/RESOURCE_EXHAUSTED is the daily free-tier cap (20 requests/day on
// gemini-3.5-flash). Retrying can't help; the caller must say so plainly.
export function isQuotaExhaustedError(error: unknown): boolean {
  const text = errorText(error);
  return text.includes('"code":429') || text.includes("RESOURCE_EXHAUSTED");
}

// Extends ApiError, not Error, specifically so it's caught by the same
// asActionResult() boundary as every other expected/safe-to-show error — a
// second special-cased class here would mean a second place that needs
// remembering when wiring up a new action.
export class AiUnavailableError extends ApiError {
  constructor(message: string) {
    super(503, message);
    this.name = "AiUnavailableError";
  }
}

// Retries only the transient case, with a short backoff, and converts the
// two known failure modes into one error type the UI can show verbatim.
async function withAiRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;

      if (isQuotaExhaustedError(error)) {
        throw new AiUnavailableError(
          "The AI has hit today's free usage limit. It'll work again tomorrow — everything else in Reckon still works.",
        );
      }
      if (!isTransientAiError(error) || attempt === attempts - 1) break;

      await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** attempt));
    }
  }

  if (isTransientAiError(lastError)) {
    throw new AiUnavailableError(
      "The AI is busy right now. Give it a moment and ask again.",
    );
  }
  throw lastError;
}

export type ParsedReceipt = {
  title: string;
  totalCents: number;
  items: { label: string; amountCents: number }[];
};

const receiptSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    totalCents: { type: Type.INTEGER },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          amountCents: { type: Type.INTEGER },
        },
        required: ["label", "amountCents"],
      },
    },
  },
  required: ["title", "totalCents", "items"],
};

export async function parseReceiptImage(
  base64: string,
  mimeType: string,
): Promise<ParsedReceipt> {
  const response = await withAiRetry(() => ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: createUserContent([
      "Read this receipt photo. Extract a short title (store name, or " +
        "'Groceries' if unclear), the total amount actually paid in cents, " +
        "and a line-item breakdown in cents. If the printed total is " +
        "unreadable, sum the items instead.",
      createPartFromBase64(base64, mimeType),
    ]),
    config: {
      responseMimeType: "application/json",
      responseSchema: receiptSchema,
    },
  }));

  return JSON.parse(response.text ?? "{}") as ParsedReceipt;
}

export async function answerGroupQuestion(
  question: string,
  context: {
    today: string;
    expenses: { title: string; totalAmount: number; paidByName: string; createdAt: string }[];
    chores: { name: string; currentAssignee: string | null; periodEnd: string | null }[];
    proposals: {
      title: string;
      status: string;
      estimatedCostPerPerson: number | null;
      dietaryTags: string[];
      flags: { userName: string; reason: string; detail: string }[];
    }[];
    ious: { fromName: string; toName: string; amount: number; note: string | null }[];
    history: { question: string; answer: string }[];
  },
): Promise<string> {
  // A short sliding window of prior turns, not the full conversation — lets
  // "what about last week" resolve against the previous answer without an
  // unbounded prompt.
  const historyText = context.history
    .map((h) => `Q: ${h.question}\nA: ${h.answer}`)
    .join("\n\n");

  const response = await withAiRetry(() => ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: createUserContent([
      `Today's date is ${context.today}.`,
      `Group expenses: ${JSON.stringify(context.expenses)}.`,
      `Group chores: ${JSON.stringify(context.chores)}.`,
      `Group proposals: ${JSON.stringify(context.proposals)}.`,
      `Group IOUs: ${JSON.stringify(context.ious)}.`,
      ...(historyText ? [`Earlier in this conversation:\n${historyText}`] : []),
      `You are the assistant inside Reckon, an app for friend groups and ` +
        `flatmates who share a home. Reckon pools shared costs and works out ` +
        `the fewest payments that settle everyone up, rotates chores weighted ` +
        `by effort so nobody keeps the worst jobs, finds the times everyone ` +
        `is genuinely free, checks proposed plans against each person's own ` +
        `budget and dietary limits, tracks quick one-to-one IOUs, and writes ` +
        `a monthly recap. It shows the working behind every number it gives.`,
      `Questions come in two kinds and you answer both:\n` +
        `1. About THIS group — use only the data above. If the data doesn't ` +
        `cover it, say so plainly rather than guessing, and never invent an ` +
        `expense, chore, plan, person or amount.\n` +
        `2. About Reckon itself, or general questions — answer helpfully from ` +
        `what you know, as any assistant would. Don't refuse these for not ` +
        `appearing in the group data; they were never meant to be there.\n` +
        `When a question names an expense, chore, plan, person or amount that ` +
        `isn't in the data above, say plainly that the group has no record of ` +
        `it. Don't answer with a greeting or a list of what you can do — that ` +
        `reads as dodging the question.`,
      // Instructions alone left the model summarising the data it *did* have
      // when asked about something absent. Showing the shape of a good
      // "not in this group" answer is what actually pins the behaviour down.
      `Worked examples of the tone and shape wanted:\n\n` +
        `Q: How much did Priya spend on the ski trip?\n` +
        `A: There's no ski trip in this group's expenses, and nobody called ` +
        `Priya is a member here.\n\n` +
        `Q: Did we sort out the car insurance?\n` +
        `A: Nothing about car insurance has been recorded in this group.\n\n` +
        `Q: What does Reckon actually do?\n` +
        `A: It splits what you share with the people you live with, works out ` +
        `the fewest payments to settle everyone, keeps the chore rota fair, ` +
        `and finds times you're all free.`,
      `Answer in 1-3 short sentences of plain language. Use the earlier ` +
        `conversation only to resolve follow-ups (like "what about" or "and ` +
        `them") — don't repeat it back: "${question}"`,
    ]),
  }));

  return response.text ?? "I couldn't come up with an answer for that.";
}

export async function generateMonthlyRecap(context: {
  month: string;
  totalSpentCents: number;
  topExpenses: { title: string; amount: number }[];
  choresCompleted: number;
  proposalsDecided: number;
}): Promise<string> {
  const response = await withAiRetry(() => ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: createUserContent([
      `Write a short (3-4 sentence), friendly recap of this group's ${context.month} for a roommate/friend-group app. ` +
        `Data: total spent $${(context.totalSpentCents / 100).toFixed(2)}, ` +
        `notable expenses: ${JSON.stringify(context.topExpenses)}, ` +
        `${context.choresCompleted} chores completed, ${context.proposalsDecided} proposals decided. ` +
        `Use only this data — don't invent specifics it doesn't cover.`,
    ]),
  }));

  return response.text ?? "Couldn't generate a recap right now.";
}

export async function correctReceiptParse(
  base64: string,
  mimeType: string,
  priorParse: ParsedReceipt,
  correction: string,
): Promise<ParsedReceipt> {
  const response = await withAiRetry(() => ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: createUserContent([
      `Here is a receipt photo and a previous extraction attempt: ${JSON.stringify(priorParse)}.`,
      `The user corrects it in plain language: "${correction}". Apply the ` +
        "correction (e.g. removing an item someone else already paid for " +
        "should reduce totalCents and drop that item) and return the " +
        "corrected extraction in the same shape.",
      createPartFromBase64(base64, mimeType),
    ]),
    config: {
      responseMimeType: "application/json",
      responseSchema: receiptSchema,
    },
  }));

  return JSON.parse(response.text ?? "{}") as ParsedReceipt;
}
