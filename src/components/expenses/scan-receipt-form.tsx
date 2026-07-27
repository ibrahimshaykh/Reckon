"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadAndParseReceipt, correctReceipt } from "@/lib/actions/receipts";
import { addItemizedExpense } from "@/lib/actions/expenses";
import { buildItemizedShares } from "@/lib/receipt-split";
import type { ParsedReceipt } from "@/lib/gemini";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  // One member-id array per parsed item — who's claiming that specific
  // item, defaulting to everyone (matches the old flat-split default).
  const [itemParticipants, setItemParticipants] = useState<string[][]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyParsed(next: ParsedReceipt) {
    setParsed(next);
    setItemParticipants(next.items.map(() => members.map((m) => m.id)));
  }

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
      applyParsed(result.parsed);
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
      applyParsed(updated);
      setCorrection("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't apply that correction.");
    } finally {
      setBusy(false);
    }
  }

  function toggleItemParticipant(itemIndex: number, memberId: string) {
    setItemParticipants((prev) =>
      prev.map((ids, i) =>
        i !== itemIndex
          ? ids
          : ids.includes(memberId)
            ? ids.filter((id) => id !== memberId)
            : [...ids, memberId],
      ),
    );
  }

  const hasUnclaimedItem = itemParticipants.some((ids) => ids.length === 0);

  async function onConfirm() {
    if (!parsed || !imageUrl || hasUnclaimedItem) return;
    setBusy(true);
    setError(null);
    try {
      const claimed = parsed.items.map((item, i) => ({
        label: item.label,
        amountCents: item.amountCents,
        participantIds: itemParticipants[i],
      }));
      const itemizedShares = buildItemizedShares(claimed, parsed.totalCents);

      await addItemizedExpense({
        groupId,
        title: parsed.title,
        paidById,
        receiptImageUrl: imageUrl,
        items: itemizedShares,
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

          <p className="text-sm text-muted-foreground">Who had what — tap a name to toggle</p>
          <ul className="flex flex-col gap-2">
            {parsed.items.map((item, i) => (
              <li key={i} className="rounded-lg border p-2">
                <p className="text-sm">
                  {item.label} — ${(item.amountCents / 100).toFixed(2)}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {members.map((m) => {
                    const claimed = itemParticipants[i]?.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleItemParticipant(i, m.id)}
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          claimed
                            ? "border-primary bg-primary/10 text-primary"
                            : "text-muted-foreground"
                        }`}
                      >
                        {m.displayName}
                      </button>
                    );
                  })}
                </div>
                {itemParticipants[i]?.length === 0 && (
                  <p className="mt-1 text-xs text-destructive">Nobody's claimed this yet.</p>
                )}
              </li>
            ))}
          </ul>
          {parsed.totalCents > parsed.items.reduce((s, it) => s + it.amountCents, 0) && (
            <p className="text-xs text-muted-foreground">
              The remaining ${(
                (parsed.totalCents - parsed.items.reduce((s, it) => s + it.amountCents, 0)) /
                100
              ).toFixed(2)}{" "}
              (tax/fees) will be split in proportion to what each person claimed above.
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={onConfirm} disabled={busy || hasUnclaimedItem}>
            {busy ? "Adding…" : "Add expense"}
          </Button>
        </>
      )}
      {error && !parsed && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
