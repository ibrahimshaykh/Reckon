"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AddExpenseForm } from "@/components/expenses/add-expense-form";
import { ScanReceiptForm } from "@/components/expenses/scan-receipt-form";
import type { Dictionary } from "@/lib/dictionary";

type Member = { id: string; displayName: string };

export function ExpenseEntryTabs({
  groupId,
  members,
  currentUserId,
  currency,
  dict,
}: {
  groupId: string;
  members: Member[];
  currentUserId: string;
  currency: string;
  dict: Dictionary;
}) {
  const [tab, setTab] = useState<"manual" | "scan">("scan");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button
          variant={tab === "scan" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("scan")}
        >
          {dict.expenses.scanTab}
        </Button>
        <Button
          variant={tab === "manual" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("manual")}
        >
          {dict.expenses.manualTab}
        </Button>
      </div>
      {tab === "scan" ? (
        <ScanReceiptForm
          groupId={groupId}
          members={members}
          currentUserId={currentUserId}
          currency={currency}
          dict={dict}
        />
      ) : (
        <AddExpenseForm
          groupId={groupId}
          members={members}
          currentUserId={currentUserId}
          currency={currency}
          dict={dict}
        />
      )}
    </div>
  );
}
