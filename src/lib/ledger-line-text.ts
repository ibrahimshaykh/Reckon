import { interpolate } from "@/lib/i18n";
import type { LedgerLine } from "@/lib/settlement-explain";
import type { Dictionary } from "@/lib/dictionary";

// Turning a ledger line into words, kept apart from the component that draws
// it so the wording can be tested directly against the real dictionaries.
// A missing or mistyped key here shows up as a blank cell or a raw "{name}"
// on the money screen, which is exactly the sort of thing a render test
// catches and a type checker doesn't.

export function describeLine(line: LedgerLine, dict: Dictionary): string {
  const vars = {
    name: line.personName,
    guest: line.guestName ?? "",
    other: line.otherName ?? "",
  };

  switch (line.kind) {
    case "paid":
      return interpolate(dict.settle.linePaid, vars);
    case "ownShare":
      return interpolate(dict.settle.lineOwnShare, vars);
    case "coveringGuest":
      return interpolate(dict.settle.lineCovering, vars);
    case "iouOwes":
      return interpolate(dict.settle.lineIouOwes, vars);
    case "iouOwed":
      return interpolate(dict.settle.lineIouOwed, vars);
    case "alreadyPaid":
      return interpolate(dict.settle.lineAlreadyPaid, vars);
    case "alreadyReceived":
      return interpolate(dict.settle.lineAlreadyReceived, vars);
  }
}

// The label column is an expense title, but IOUs and payments have no title of
// their own, so they get a translated word rather than a raw internal marker.
export function describeLabel(line: LedgerLine, dict: Dictionary): string {
  if (line.kind === "iouOwes" || line.kind === "iouOwed") return dict.settle.lineLabelIou;
  if (line.kind === "alreadyPaid" || line.kind === "alreadyReceived") {
    return dict.settle.lineLabelPayment;
  }
  return line.label;
}
