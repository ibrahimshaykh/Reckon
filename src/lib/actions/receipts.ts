"use server";

import { put } from "@vercel/blob";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import {
  parseReceiptImage,
  correctReceiptParse,
  type ParsedReceipt,
} from "@/lib/gemini";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function uploadAndParseReceipt(
  base64: string,
  mimeType: string,
  filename: string,
) {
  const session = await requireSession();
  await enforceRateLimit(`receipt:${session.id}`, 15, 60);
  if (!mimeType.startsWith("image/")) {
    throw new ApiError(400, "File must be an image.");
  }

  const buffer = Buffer.from(base64, "base64");
  const blob = await put(`receipts/${Date.now()}-${filename}`, buffer, {
    access: "public",
    contentType: mimeType,
    addRandomSuffix: true,
  });

  const parsed = await parseReceiptImage(base64, mimeType);

  return { imageUrl: blob.url, parsed };
}

export async function correctReceipt(input: {
  base64: string;
  mimeType: string;
  priorParse: ParsedReceipt;
  correction: string;
}) {
  const session = await requireSession();
  await enforceRateLimit(`receipt:${session.id}`, 15, 60);
  return correctReceiptParse(
    input.base64,
    input.mimeType,
    input.priorParse,
    input.correction,
  );
}
