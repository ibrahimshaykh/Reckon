"use client";

import { useState } from "react";
import { askGroupQuestion } from "@/lib/actions/ai-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type SourceCounts = { expenses: number; chores: number; proposals: number; ious: number };
type Turn = { question: string; answer: string; sourceCounts: SourceCounts };

const SUGGESTED_QUESTIONS = [
  "How much have we spent this month?",
  "Who paid the most for groceries?",
  "What chores are due this week?",
  "Any dietary conflicts on open proposals?",
];

export function AskForm({ groupId }: { groupId: string }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);

  async function ask(q: string) {
    if (!q.trim() || pending) return;
    setPending(true);
    setQuestion("");
    try {
      const history = turns.map((t) => ({ question: t.question, answer: t.answer }));
      const result = await askGroupQuestion(groupId, q, history);
      setTurns((prev) => [...prev, { question: q, answer: result.answer, sourceCounts: result.sourceCounts }]);
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await ask(question);
  }

  return (
    <div className="flex flex-col gap-3">
      {turns.length === 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">Try asking:</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                disabled={pending}
                className="rounded-full border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {turns.length > 0 && (
        <div className="flex flex-col gap-3">
          {turns.map((t, i) => (
            <div key={i} className="flex flex-col gap-1">
              <p className="self-end rounded-lg bg-primary/10 px-3 py-1.5 text-sm">{t.question}</p>
              <p className="rounded-lg border p-3 text-sm">{t.answer}</p>
              <p className="text-[0.65rem] text-muted-foreground">
                Based on {t.sourceCounts.expenses} expenses, {t.sourceCounts.chores} chores,{" "}
                {t.sourceCounts.proposals} proposals, {t.sourceCounts.ious} IOUs
              </p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={turns.length === 0 ? "Ask about this group…" : "Ask a follow-up…"}
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Asking…" : "Ask"}
        </Button>
      </form>
    </div>
  );
}
