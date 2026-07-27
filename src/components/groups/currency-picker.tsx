"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { updateGroupCurrency } from "@/lib/actions/groups";
import { CURRENCIES, COMMON_CURRENCY_CODES, findCurrency } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function CurrencyPicker({ groupId, currency }: { groupId: string; currency: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);

  const current = findCurrency(currency);

  const results = useMemo(() => {
    if (!search.trim()) {
      return COMMON_CURRENCY_CODES.map((code) => findCurrency(code)!).filter(Boolean);
    }
    const q = search.trim().toLowerCase();
    return CURRENCIES.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [search]);

  async function onSelect(code: string) {
    setPending(true);
    await updateGroupCurrency(groupId, code);
    setPending(false);
    setOpen(false);
    setSearch("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {current ? `${current.flag} ${current.code}` : currency}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Group currency</DialogTitle>
        </DialogHeader>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or code…"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          {search.trim() ? "Results" : "Common"}
        </p>
        <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {results.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                disabled={pending}
                onClick={() => onSelect(c.code)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${
                  c.code === currency ? "bg-primary/10 text-primary" : ""
                }`}
              >
                <span>{c.flag}</span>
                <span className="flex-1">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.code}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No currencies match.</p>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
