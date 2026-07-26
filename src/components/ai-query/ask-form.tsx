"use client";

import { useState } from "react";
import { askGroupQuestion } from "@/lib/actions/ai-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AskForm({ groupId, primer }: { groupId: string; primer: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setAnswer(null);
    try {
      const result = await askGroupQuestion(groupId, question);
      setAnswer(result);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 max-w-sm">
      <pre className="whitespace-pre-wrap rounded-lg border bg-muted p-3 text-xs text-muted-foreground">
        {primer}
      </pre>
      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about this group…"
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Asking…" : "Ask"}
        </Button>
      </form>
      {answer && <p className="rounded-lg border p-3 text-sm">{answer}</p>}
    </div>
  );
}
