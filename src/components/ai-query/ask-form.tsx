"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
import { useSketchpad } from "@/lib/stores/sketchpad";

type SourceCounts = { expenses: number; chores: number; proposals: number; ious: number };
// sourceCounts is null when the turn is an error rather than a real answer —
// "based on 3 expenses" under a quota message would be nonsense. streaming is
// true for the one turn currently being typed out, so its answer bubble can
// be styled as in-progress rather than a finished error or answer.
type Turn = {
  question: string;
  answer: string;
  sourceCounts: SourceCounts | null;
  streaming?: boolean;
};

export function AskForm({ groupId, dict }: { groupId: string; dict: Dictionary }) {
  const SUGGESTED_QUESTIONS = [
    dict.ask.suggested1,
    dict.ask.suggested2,
    dict.ask.suggested3,
    dict.ask.suggested4,
  ];
  const jot = useSketchpad((s) => s.jot);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);

  // Appends to whichever turn is mid-stream, by index — turns never reorder
  // while pending, so this is unambiguous.
  function updateStreamingTurn(index: number, patch: Partial<Turn>) {
    setTurns((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  async function ask(q: string) {
    if (!q.trim() || pending) return;
    setPending(true);
    setQuestion("");
    const history = turns.map((t) => ({ question: t.question, answer: t.answer }));

    const turnIndex = turns.length;
    setTurns((prev) => [
      ...prev,
      { question: q, answer: "", sourceCounts: null, streaming: true },
    ]);

    try {
      const response = await fetch(`/api/groups/${groupId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });

      if (!response.ok) {
        // Running out of the daily AI quota is a normal thing to hit, so it's
        // shown as its own turn rather than swallowed — otherwise the
        // question simply vanished with no answer and no explanation.
        const { error } = await response.json();
        updateStreamingTurn(turnIndex, {
          answer: error ?? "Something went wrong asking that.",
          sourceCounts: null,
          streaming: false,
        });
        return;
      }

      const sourceCountsHeader = response.headers.get("X-Source-Counts");
      const sourceCounts: SourceCounts | null = sourceCountsHeader
        ? JSON.parse(sourceCountsHeader)
        : null;

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += decoder.decode(value, { stream: true });
          updateStreamingTurn(turnIndex, { answer });
        }
      }

      updateStreamingTurn(turnIndex, { answer, sourceCounts, streaming: false });
      // The margin keeps the question, not the answer — it's the thing you'd
      // want to glance back at to remember what you were chasing.
      jot(q.length > 42 ? `${q.slice(0, 42).trimEnd()}…` : q);
    } catch {
      updateStreamingTurn(turnIndex, {
        answer: "Couldn't reach the AI just now. Try again in a moment.",
        sourceCounts: null,
        streaming: false,
      });
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
          {turns.map((t, i) => {
            // A streaming turn starts with sourceCounts: null, same as an
            // error turn once it's finished — the two must not share styling,
            // or an in-progress answer would flash the warning colour used
            // for quota/rate-limit messages until its first chunk arrives.
            const isError = !t.streaming && !t.sourceCounts;
            return (
              <div key={i} className="flex flex-col gap-1">
                <p className="self-end rounded-lg bg-primary/10 px-3 py-1.5 text-sm">{t.question}</p>
                <p
                  className={`rounded-lg border p-3 text-sm ${
                    isError ? "border-warm/40 bg-warm-surface/40 text-foreground" : ""
                  }`}
                >
                  {t.answer}
                  {t.streaming && (
                    <span
                      aria-hidden
                      className="ms-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle"
                    />
                  )}
                </p>
                {t.sourceCounts && (
                  <p className="text-[0.65rem] text-muted-foreground">
                    {interpolate(dict.ask.basedOn, {
                      expenses: t.sourceCounts.expenses,
                      chores: t.sourceCounts.chores,
                      proposals: t.sourceCounts.proposals,
                      ious: t.sourceCounts.ious,
                    })}
                  </p>
                )}
              </div>
            );
          })}
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
