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
