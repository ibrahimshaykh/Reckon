export type SummaryParticipant = { id: string; name: string };

export type ExpenseSummary =
  | { kind: "sharedBy"; names: string[] }
  | { kind: "boughtFor"; payer: string; names: string[] }
  | { kind: "paidForSelf"; payer: string }
  | { kind: "none" };

/**
 * Works out which sentence describes an expense, so a row reads like something
 * a person would say rather than a bare amount.
 *
 * The distinction that matters is whether the payer is in the split:
 *   - payer is in it  -> they shared the cost      ("Ibrahim and Lola shared this")
 *   - payer is not    -> they bought it for others ("Ibrahim bought this for Lola")
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

  // Payer first — they fronted the money, so they lead the sentence.
  const others = participants.filter((p) => p.id !== payerId).map((p) => p.name);
  return { kind: "sharedBy", names: [payerName, ...others] };
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
