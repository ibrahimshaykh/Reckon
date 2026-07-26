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
        <img
          src={imageUrl}
          alt="Receipt"
          className="max-h-48 rounded-lg border object-contain"
        />
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
