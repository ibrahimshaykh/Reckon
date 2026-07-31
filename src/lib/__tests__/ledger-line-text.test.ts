import { describe, it, expect } from "vitest";
import en from "@/dictionaries/en.json";
import ur from "@/dictionaries/ur.json";
import es from "@/dictionaries/es.json";
import { describeLine, describeLabel } from "@/lib/ledger-line-text";
import type { LedgerLine, LedgerLineKind } from "@/lib/settlement-explain";
import type { Dictionary } from "@/lib/dictionary";

// Checks the words the settle screen actually prints, against the real
// dictionaries. A missing key or a stray placeholder renders as a blank cell
// or a literal "{name}", neither of which the type checker notices.

const LOCALES: [string, Dictionary][] = [
  ["en", en as Dictionary],
  ["ur", ur as Dictionary],
  ["es", es as Dictionary],
];

const ALL_KINDS: LedgerLineKind[] = [
  "paid",
  "ownShare",
  "coveringGuest",
  "iouOwes",
  "iouOwed",
  "alreadyPaid",
  "alreadyReceived",
];

const lineOf = (kind: LedgerLineKind): LedgerLine => ({
  label: "burgers",
  kind,
  personName: "Lola",
  guestName: "ali",
  otherName: "Ibrahim",
  amountCents: -1000,
});

describe.each(LOCALES)("ledger wording in %s", (locale, dict) => {
  it.each(ALL_KINDS)("says something real for %s", (kind) => {
    const text = describeLine(lineOf(kind), dict);

    expect(text.trim()).not.toBe("");
    // An unreplaced placeholder means the template and the data disagree.
    expect(text).not.toMatch(/\{[a-z]+\}/i);
    expect(text).not.toContain("undefined");
  });

  it.each(ALL_KINDS)("labels %s without leaking an internal marker", (kind) => {
    const text = describeLabel(lineOf(kind), dict);

    expect(text.trim()).not.toBe("");
    // "IOU" and "payment" are internal markers on the line, never shown raw.
    if (kind !== "paid" && kind !== "ownShare" && kind !== "coveringGuest") {
      expect(text).not.toBe("payment");
    }
  });

  it("names both people on an IOU", () => {
    const owes = describeLine(lineOf("iouOwes"), dict);
    const owed = describeLine(lineOf("iouOwed"), dict);

    for (const text of [owes, owed]) {
      expect(text).toContain("Lola");
      expect(text).toContain("Ibrahim");
    }
    // The two directions must not read identically, or the receipt can't say
    // which way the money goes.
    expect(owes).not.toBe(owed);
  });

  it("names both the host and the guest when covering someone", () => {
    const text = describeLine(lineOf("coveringGuest"), dict);

    expect(text).toContain("Lola");
    expect(text).toContain("ali");
  });

  it("distinguishes paying from being paid", () => {
    expect(describeLine(lineOf("alreadyPaid"), dict)).not.toBe(
      describeLine(lineOf("alreadyReceived"), dict),
    );
  });
});

describe("English wording, spelled out", () => {
  const dict = en as Dictionary;

  it("reads the way someone would say it", () => {
    expect(describeLine(lineOf("paid"), dict)).toBe("Lola paid this");
    expect(describeLine(lineOf("ownShare"), dict)).toBe("Lola’s own share");
    expect(describeLine(lineOf("coveringGuest"), dict)).toBe(
      "Lola covering for ali, who hasn’t paid yet",
    );
    expect(describeLine(lineOf("iouOwes"), dict)).toBe("Lola owes Ibrahim");
    expect(describeLine(lineOf("iouOwed"), dict)).toBe("Ibrahim owes Lola");
    expect(describeLine(lineOf("alreadyPaid"), dict)).toBe("Lola already paid Ibrahim");
    expect(describeLine(lineOf("alreadyReceived"), dict)).toBe(
      "Ibrahim already paid Lola",
    );
  });

  it("labels an expense by its title, and the rest by what they are", () => {
    expect(describeLabel(lineOf("ownShare"), dict)).toBe("burgers");
    expect(describeLabel(lineOf("iouOwes"), dict)).toBe("IOU");
    expect(describeLabel(lineOf("alreadyPaid"), dict)).toBe("settled up");
  });
});
