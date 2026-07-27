"use client";

import { useState } from "react";
import { askGroupQuestion } from "@/lib/actions/ai-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";

type SourceCounts = { expenses: number; chores: number; proposals: number; ious: number };
type Turn = { question: string; answer: string; sourceCounts: SourceCounts };

export function AskForm({ groupId, dict }: { groupId: string; dict: Dictionary }) {
  const SUGGESTED_QUESTIONS = [
    dict.ask.suggested1,
    dict.ask.suggested2,
    dict.ask.suggested3,
    dict.ask.suggested4,
  ];
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
          <p className="text-xs text-muted-foreground">{dict.ask.tryAsking}</p>
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
                {interpolate(dict.ask.basedOn, {
                  expenses: t.sourceCounts.expenses,
                  chores: t.sourceCounts.chores,
                  proposals: t.sourceCounts.proposals,
                  ious: t.sourceCounts.ious,
                })}
              </p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={turns.length === 0 ? dict.ask.placeholderFirst : dict.ask.placeholderFollowup}
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? dict.ask.asking : dict.ask.askButton}
        </Button>
      </form>
    </div>
  );
}
