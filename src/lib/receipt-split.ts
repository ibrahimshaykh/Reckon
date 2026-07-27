export type ClaimedItem = { label: string; amountCents: number; participantIds: string[] };
export type ItemizedShare = { label: string; amountCents: number; shares: Record<string, number> };

// Builds the final per-item participant shares, including a trailing
// proportional "Tax & other charges" item when the receipt's printed total
// exceeds the sum of claimed items. That remainder is distributed by each
// person's claimed subtotal, not split evenly — someone who only had a $2
// coffee shouldn't owe the same tax share as someone who ordered a $40
// entree.
export function buildItemizedShares(items: ClaimedItem[], totalCents: number): ItemizedShare[] {
  const result: ItemizedShare[] = items.map((item) => {
    const ratio = 1 / item.participantIds.length;
    const shares: Record<string, number> = {};
    item.participantIds.forEach((id) => (shares[id] = ratio));
    return { label: item.label, amountCents: item.amountCents, shares };
  });

  const itemsSum = items.reduce((sum, i) => sum + i.amountCents, 0);
  const remainderCents = totalCents - itemsSum;
  if (remainderCents <= 0) return result;

  const subtotalByUser: Record<string, number> = {};
  for (const item of items) {
    const perPerson = item.amountCents / item.participantIds.length;
    for (const id of item.participantIds) {
      subtotalByUser[id] = (subtotalByUser[id] ?? 0) + perPerson;
    }
  }

  const totalClaimed = Object.values(subtotalByUser).reduce((a, b) => a + b, 0);
  if (totalClaimed <= 0) return result; // nobody claimed anything to prorate against

  const remainderShares: Record<string, number> = {};
  for (const [userId, subtotal] of Object.entries(subtotalByUser)) {
    remainderShares[userId] = subtotal / totalClaimed;
  }

  result.push({ label: "Tax & other charges", amountCents: remainderCents, shares: remainderShares });
  return result;
}
