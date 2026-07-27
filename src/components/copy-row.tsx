"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/dictionary";

export function CopyRow({
  label,
  value,
  dict,
}: {
  label: string;
  value: string;
  dict: Dictionary;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center justify-between rounded-md border px-2 py-1 text-xs">
      <span>
        {label}: {value}
      </span>
      <Button size="sm" variant="ghost" onClick={onCopy}>
        {copied ? dict.common.copied : dict.common.copy}
      </Button>
    </div>
  );
}
