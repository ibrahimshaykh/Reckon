import {
  GoogleGenAI,
  Type,
  createUserContent,
  createPartFromBase64,
} from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
  const response = await ai.models.generateContent({
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
  });

  return JSON.parse(response.text ?? "{}") as ParsedReceipt;
}

const CAPABILITY_PRIMER = `You can ask things like:
- "How much have we spent this month?"
- "Who paid the most for groceries?"
- "What chores does Sam have this week?"
- "Are there any dietary conflicts on the pizza proposal?"`;

export function getCapabilityPrimer(): string {
  return CAPABILITY_PRIMER;
}

export async function answerGroupQuestion(
  question: string,
  context: {
    today: string;
    expenses: { title: string; totalAmount: number; paidByName: string; createdAt: string }[];
    chores: { name: string; currentAssignee: string | null; periodEnd: string | null }[];
  },
): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: createUserContent([
      `Today's date is ${context.today}.`,
      `Group expenses: ${JSON.stringify(context.expenses)}.`,
      `Group chores: ${JSON.stringify(context.chores)}.`,
      `Answer this question about the group in 1-3 short sentences, using ` +
        `only the data given. If the data doesn't cover it, say so plainly ` +
        `instead of guessing: "${question}"`,
    ]),
  });

  return response.text ?? "I couldn't come up with an answer for that.";
}

export async function generateMonthlyRecap(context: {
  month: string;
  totalSpentCents: number;
  topExpenses: { title: string; amount: number }[];
  choresCompleted: number;
  proposalsDecided: number;
}): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: createUserContent([
      `Write a short (3-4 sentence), friendly recap of this group's ${context.month} for a roommate/friend-group app. ` +
        `Data: total spent $${(context.totalSpentCents / 100).toFixed(2)}, ` +
        `notable expenses: ${JSON.stringify(context.topExpenses)}, ` +
        `${context.choresCompleted} chores completed, ${context.proposalsDecided} proposals decided. ` +
        `Use only this data — don't invent specifics it doesn't cover.`,
    ]),
  });

  return response.text ?? "Couldn't generate a recap right now.";
}

export async function correctReceiptParse(
  base64: string,
  mimeType: string,
  priorParse: ParsedReceipt,
  correction: string,
): Promise<ParsedReceipt> {
  const response = await ai.models.generateContent({
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
  });

  return JSON.parse(response.text ?? "{}") as ParsedReceipt;
}
