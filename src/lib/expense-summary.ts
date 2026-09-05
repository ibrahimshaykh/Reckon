export type SummaryParticipant = { id: string; name: string };

export type ExpenseSummary =
  | { kind: "sharedBy"; payer: string; names: string[] }
  | { kind: "boughtFor"; payer: string; names: string[] }
  | { kind: "paidForSelf"; payer: string }
  | { kind: "none" };

/**
 * Works out which sentence describes an expense, so a row reads like something
 * a person would say rather than a bare amount.
 *
 * The distinction that matters is whether the payer is in the split:
 *   - payer is in it  -> they shared the cost      ("Ibrahim paid, split with Lola")
 *   - payer is not    -> they bought it for others ("Ibrahim bought this for Lola")
 *
 * Every shape names the payer. The shared one used to leave them unnamed and
 * signal them by putting them first in the list instead — a convention that is
 * invisible to anybody reading the row, on the one fact that matters most
 * about a shared bill.
 *
 * Returns a shape rather than a string because the three sentences are separate
 * dictionary entries — the word order differs per language, so they can't be
 * assembled from fragments.
 */
export function summariseExpense(
  payerId: string,
  payerName: string,
  participants: SummaryParticipant[],
): ExpenseSummary {
  if (participants.length === 0) return { kind: "none" };

  const payerIsParticipant = participants.some((p) => p.id === payerId);

  if (!payerIsParticipant) {
    return { kind: "boughtFor", payer: payerName, names: participants.map((p) => p.name) };
  }

  if (participants.length === 1) {
    return { kind: "paidForSelf", payer: payerName };
  }

  // The payer is named by the sentence itself, so the list is everyone else.
  // Including them here as well would read "Lola paid, split with Lola and
  // Ibrahim".
  const others = participants.filter((p) => p.id !== payerId).map((p) => p.name);
  return { kind: "sharedBy", payer: payerName, names: others };
}

/**
 * "Ibrahim", "Ibrahim and Lola", "Ibrahim, Lola and Sara".
 * `and` is passed in so the conjunction can be localised.
 */
export function joinNames(names: string[], and: string): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} ${and} ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} ${and} ${names.at(-1)}`;
}
