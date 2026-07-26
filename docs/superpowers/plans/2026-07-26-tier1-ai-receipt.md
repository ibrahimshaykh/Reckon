# Tier 1 — AI Receipt Reading Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Complete spec feature #2 — the photo path. Upload a receipt photo, get an AI extraction (title, total, line items), correct it in plain language via a chat box under the photo, then hand the corrected total off to the same expense-creation flow Task 3 of the previous plan already built.

**Architecture:** Client reads the photo as base64 (`FileReader`), so the same bytes can be sent to Vercel Blob (for storage/display) and to Gemini (for parsing) without re-reading the file. A single Server Action does the upload + first parse; a second does re-parse-on-correction, replaying the photo + prior parse + the user's correction message each time (stateless — no server-side chat session to manage). The existing `addManualExpense` action is extended with an optional `source`/`receiptImageUrl` rather than duplicated.

**Tech Stack:** `@google/genai` (Gemini), `@vercel/blob`, Next.js Server Actions.

## Global Constraints

- Gemini model id is `gemini-3.5-flash`; SDK is `@google/genai`. Structured output via `responseSchema` + `Type`.
- Money is integer cents everywhere until the DB boundary.
- $0 budget: Vercel Blob free tier, Gemini free tier — no other services.
- Server Actions default to a 1MB body limit; receipt photos need more room.

---

### Task 1: Next.js config + Gemini client

**Files:**
- Modify: `next.config.ts`
- Create: `src/lib/gemini.ts`

**Interfaces:**
- Produces: `parseReceiptImage(base64, mimeType)`, `correctReceiptParse(base64, mimeType, priorParse, correction)`, both returning `ParsedReceipt = { title: string; totalCents: number; items: { label: string; amountCents: number }[] }`.

- [ ] **Step 1** — `next.config.ts`, raise the Server Action body limit for photo uploads:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
```

- [ ] **Step 2** — `src/lib/gemini.ts`:

```ts
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
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean.

- [ ] **Step 4: Commit** — `feat: Gemini client for receipt parsing`.

---

### Task 2: Upload + parse + correct Server Actions

**Files:**
- Create: `src/lib/actions/receipts.ts`
- Modify: `src/lib/actions/expenses.ts` (extend `addManualExpense` with optional `source`/`receiptImageUrl`)

**Interfaces:**
- Consumes: `parseReceiptImage`, `correctReceiptParse` from Task 1; `requireSession`.
- Produces: `uploadAndParseReceipt(base64: string, mimeType: string, filename: string)` returning `{ imageUrl: string; parsed: ParsedReceipt }`; `correctReceipt(input)` returning `ParsedReceipt`.

- [ ] **Step 1** — `src/lib/actions/receipts.ts`:

```ts
"use server";

import { put } from "@vercel/blob";
import { requireSession } from "@/lib/dal";
import { ApiError } from "@/lib/api-error";
import {
  parseReceiptImage,
  correctReceiptParse,
  type ParsedReceipt,
} from "@/lib/gemini";

export async function uploadAndParseReceipt(
  base64: string,
  mimeType: string,
  filename: string,
) {
  await requireSession();
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
  await requireSession();
  return correctReceiptParse(
    input.base64,
    input.mimeType,
    input.priorParse,
    input.correction,
  );
}
```

- [ ] **Step 2** — modify `src/lib/actions/expenses.ts`: extend `AddManualExpenseInput` with `source?: "MANUAL" | "RECEIPT_AI"` and `receiptImageUrl?: string`, and pass them into the `db.expense.create` call (`source: input.source ?? "MANUAL"`, `receiptImageUrl: input.receiptImageUrl`).

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean.

- [ ] **Step 4: Commit** — `feat: receipt upload, AI parse, and correction Server Actions`.

---

### Task 3: Receipt scan UI with chat correction

**Files:**
- Create: `src/components/expenses/scan-receipt-form.tsx`
- Modify: `src/app/groups/[groupId]/expenses/new/page.tsx` (tab between "Manual entry" and "Scan receipt")

**Interfaces:**
- Consumes: `uploadAndParseReceipt`, `correctReceipt` from Task 2; `addManualExpense` from the prior plan; `toCents` from `@/lib/money`.

- [ ] **Step 1** — `src/components/expenses/scan-receipt-form.tsx`. Flow: file input → read as base64 client-side → `uploadAndParseReceipt` → show title/total/items + a correction textarea (each submit calls `correctReceipt` and replaces the shown parse) → a final "participants" step reusing the same paid-by/split UI as manual entry → `addManualExpense` with `source: "RECEIPT_AI"`.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadAndParseReceipt, correctReceipt } from "@/lib/actions/receipts";
import { addManualExpense } from "@/lib/actions/expenses";
import type { ParsedReceipt } from "@/lib/gemini";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Member = { id: string; displayName: string };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ScanReceiptForm({
  groupId,
  members,
  currentUserId,
}: {
  groupId: string;
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [base64, setBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const [correction, setCorrection] = useState("");
  const [paidById, setPaidById] = useState(currentUserId);
  const [participantIds, setParticipantIds] = useState<string[]>(
    members.map((m) => m.id),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const b64 = await fileToBase64(file);
      setBase64(b64);
      setMimeType(file.type);
      const result = await uploadAndParseReceipt(b64, file.type, file.name);
      setImageUrl(result.imageUrl);
      setParsed(result.parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that receipt.");
    } finally {
      setBusy(false);
    }
  }

  async function onCorrect(e: React.FormEvent) {
    e.preventDefault();
    if (!base64 || !mimeType || !parsed || !correction.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await correctReceipt({
        base64,
        mimeType,
        priorParse: parsed,
        correction,
      });
      setParsed(updated);
      setCorrection("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't apply that correction.");
    } finally {
      setBusy(false);
    }
  }

  function toggleParticipant(id: string) {
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  async function onConfirm() {
    if (!parsed || !imageUrl) return;
    setBusy(true);
    setError(null);
    try {
      await addManualExpense({
        groupId,
        title: parsed.title,
        totalCents: parsed.totalCents,
        paidById,
        participantIds,
        splitType: "EQUAL",
        source: "RECEIPT_AI",
        receiptImageUrl: imageUrl,
      });
      router.push(`/groups/${groupId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 max-w-sm">
      {!imageUrl && (
        <Input type="file" accept="image/*" onChange={onFileChange} disabled={busy} />
      )}
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="Receipt" className="max-h-48 rounded-lg border object-contain" />
      )}
      {parsed && (
        <div className="rounded-lg border p-3 text-sm">
          <p className="font-medium">{parsed.title}</p>
          <p className="text-muted-foreground">
            Total: ${(parsed.totalCents / 100).toFixed(2)}
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
            {parsed.items.map((item, i) => (
              <li key={i}>
                {item.label} — ${(item.amountCents / 100).toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {parsed && (
        <form onSubmit={onCorrect} className="flex gap-2">
          <Input
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="e.g. don't add the beer, Sam already paid for that"
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !correction.trim()}>
            Fix
          </Button>
        </form>
      )}
      {parsed && (
        <>
          <label className="text-sm text-muted-foreground">Paid by</label>
          <select
            className="rounded-md border bg-background p-2 text-sm"
            value={paidById}
            onChange={(e) => setPaidById(e.target.value)}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
          <label className="text-sm text-muted-foreground">Split between</label>
          <div className="flex flex-col gap-1">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={participantIds.includes(m.id)}
                  onCheckedChange={() => toggleParticipant(m.id)}
                />
                {m.displayName}
              </label>
            ))}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? "Adding…" : "Add expense"}
          </Button>
        </>
      )}
      {error && !parsed && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2** — modify `src/app/groups/[groupId]/expenses/new/page.tsx` to render both `<AddExpenseForm>` and `<ScanReceiptForm>` under a simple tab toggle (Client Component wrapper, or two `<details>`-style sections — keep it simple, no new UI dependency).

- [ ] **Step 3: Verify live** — dev server, go to the new-expense page, switch to "Scan receipt", upload a real photo of a receipt (or a simple test image with visible text/prices), confirm Gemini returns a plausible title/total/items, type a correction ("don't add the tip"), confirm the parse updates, confirm the final "Add expense" creates an `Expense` row with `source = RECEIPT_AI` and a `receiptImageUrl` set, and that it appears correctly in the group's expense list and settlement.

- [ ] **Step 4: Commit** — `feat: receipt photo scan with AI parsing and chat correction`.

---

## Self-Review

- **Spec coverage:** #2 (AI receipt reading, photo path + chat correction) — Tasks 1–3. Builds directly on the manual-entry `addManualExpense` action from the prior plan rather than duplicating expense-creation logic.
- **Placeholders:** none — every step has concrete code.
- **Type consistency:** `ParsedReceipt` is defined once in `gemini.ts` and reused unchanged through `receipts.ts` and `scan-receipt-form.tsx`. `addManualExpense`'s extended signature matches what `ScanReceiptForm` calls.
- **Known simplification:** correction re-sends the full photo + prior parse on every message (stateless) rather than maintaining a server-side chat session — acceptable at receipt-photo size and matches the $0/no-infra constraint.
