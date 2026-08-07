import { describe, it, expect } from "vitest";
import {
  deriveItemShares,
  toShareRatios,
  type GuestShareInput,
  type GuestStatus,
} from "@/lib/guest-shares";
import { computeBalances, computeSettlements } from "@/lib/settlement";
import { buildLedgerLines, sumLines } from "@/lib/settlement-explain";

const GUEST_COUNTS = [4, 5, 10, 20, 30];
const STATUSES: GuestStatus[] = [
  "UNDECIDED",
  "PAYING",
  "SENT",
  "PAID",
  "DECLINED",
];

const MEMBERS = ["ibrahim", "lola", "sam"];

// Hosts are deliberately uneven: some guests belong to one person, some to
// two, some to the whole table. An even spread would hide exactly the bugs
// that matter — a share landing on the wrong host, or a remainder that only
// balances because everything was symmetrical.
function makeGuests(count: number, statusOffset = 0): GuestShareInput[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `g${i}`,
    status: STATUSES[(i + statusOffset) % STATUSES.length],
    hostIds:
      i % 3 === 0
        ? [MEMBERS[i % MEMBERS.length]]
        : i % 3 === 1
          ? [MEMBERS[i % MEMBERS.length], MEMBERS[(i + 1) % MEMBERS.length]]
          : MEMBERS,
  }));
}

describe.each(GUEST_COUNTS)("%i guests", (count) => {
  // 70000 divides awkwardly by most head counts, which is the point.
  const totalCents = 70000;

  it("charges every cent to exactly one person", () => {
    const guests = makeGuests(count);
    const { memberCents, guestShareCents } = deriveItemShares({
      totalCents,
      memberIds: MEMBERS,
      guests,
    });

    const paidByGuests = guests
      .filter((g) => g.status === "PAID")
      .reduce((sum, g) => sum + guestShareCents[g.id], 0);
    const owedByMembers = Object.values(memberCents).reduce((a, b) => a + b, 0);

    expect(owedByMembers + paidByGuests).toBe(totalCents);
  });

  it("quotes every head within a penny of an even split", () => {
    const guests = makeGuests(count);
    const { memberCents, guestShareCents, guestHostSplit } = deriveItemShares({
      totalCents,
      memberIds: MEMBERS,
      guests,
    });

    const heads = MEMBERS.length + count;
    const fair = totalCents / heads;

    for (const cents of Object.values(guestShareCents)) {
      expect(Math.abs(cents - fair)).toBeLessThan(1);
    }

    // A member's own share is what's left after removing what they carry.
    for (const member of MEMBERS) {
      const carried = guests.reduce(
        (sum, g) => sum + (guestHostSplit[g.id]?.[member] ?? 0),
        0,
      );
      expect(Math.abs(memberCents[member] - carried - fair)).toBeLessThan(1);
    }
  });

  it("hands each guest's share to their hosts and nobody else", () => {
    const guests = makeGuests(count);
    const { guestShareCents, guestHostSplit } = deriveItemShares({
      totalCents,
      memberIds: MEMBERS,
      guests,
    });

    for (const guest of guests) {
      const split = guestHostSplit[guest.id];
      if (guest.status === "PAID") {
        expect(split).toEqual({});
        continue;
      }
      expect(Object.keys(split).sort()).toEqual([...guest.hostIds].sort());
      expect(Object.values(split).reduce((a, b) => a + b, 0)).toBe(
        guestShareCents[guest.id],
      );
    }
  });

  it("settles to zero — every balance clears", () => {
    const guests = makeGuests(count);
    const { memberCents, groupTotalCents } = deriveItemShares({
      totalCents,
      memberIds: MEMBERS,
      guests,
    });

    const balances = computeBalances([
      {
        paidById: "ibrahim",
        totalCents: groupTotalCents,
        participants: Object.entries(toShareRatios(memberCents, groupTotalCents)).map(
          ([userId, shareRatio]) => ({ userId, shareRatio }),
        ),
      },
    ]);

    const settlements = computeSettlements(balances);
    const cleared: Record<string, number> = { ...balances };
    for (const s of settlements) {
      cleared[s.fromUserId] += s.amountCents;
      cleared[s.toUserId] -= s.amountCents;
    }

    for (const remaining of Object.values(cleared)) {
      expect(remaining).toBe(0);
    }
  });

  it("explains each member's balance line by line, adding up exactly", () => {
    const guests = makeGuests(count);
    const { memberCents, guestHostSplit, groupTotalCents } = deriveItemShares({
      totalCents,
      memberIds: MEMBERS,
      guests,
    });

    const balances = computeBalances([
      {
        paidById: "ibrahim",
        totalCents: groupTotalCents,
        participants: Object.entries(toShareRatios(memberCents, groupTotalCents)).map(
          ([userId, shareRatio]) => ({ userId, shareRatio }),
        ),
      },
    ]);

    for (const member of MEMBERS) {
      const lines = buildLedgerLines({
        userId: member,
        expenses: [
          {
            title: "big night out",
            paidById: "ibrahim",
            paidCents: groupTotalCents,
            memberCents,
            guests: guests.map((g) => ({
              name: g.id,
              hostSplit: guestHostSplit[g.id] ?? {},
            })),
          },
        ],
        ious: [],
        nameOf: (id) => id,
      });

      expect(sumLines(lines)).toBe(balances[member]);
    }
  });

  // Rotating the statuses walks every guest through all four answers, so no
  // single lucky arrangement can carry the whole test.
  it.each([0, 1, 2, 3])("stays exact whatever each guest answers (offset %i)", (offset) => {
    const guests = makeGuests(count, offset);
    const { memberCents, guestShareCents, groupTotalCents } = deriveItemShares({
      totalCents,
      memberIds: MEMBERS,
      guests,
    });

    const paidByGuests = guests
      .filter((g) => g.status === "PAID")
      .reduce((sum, g) => sum + guestShareCents[g.id], 0);

    expect(groupTotalCents + paidByGuests).toBe(totalCents);
    expect(Object.values(memberCents).reduce((a, b) => a + b, 0)).toBe(groupTotalCents);
  });

  // A total that can't divide cleanly by anything, at every scale.
  it("loses nothing on an awkward total", () => {
    const guests = makeGuests(count);
    const { memberCents, guestShareCents } = deriveItemShares({
      totalCents: 10007,
      memberIds: MEMBERS,
      guests,
    });

    const paidByGuests = guests
      .filter((g) => g.status === "PAID")
      .reduce((sum, g) => sum + guestShareCents[g.id], 0);

    expect(Object.values(memberCents).reduce((a, b) => a + b, 0) + paidByGuests).toBe(
      10007,
    );
  });
});

describe("very small bills spread very thin", () => {
  it("still reconciles when there are more heads than cents", () => {
    // 30 guests + 3 members on a 10-cent bill: most people owe nothing, and
    // the few pennies have to land somewhere without being duplicated.
    const guests = makeGuests(30);
    const { memberCents, guestShareCents } = deriveItemShares({
      totalCents: 10,
      memberIds: MEMBERS,
      guests,
    });

    const paidByGuests = guests
      .filter((g) => g.status === "PAID")
      .reduce((sum, g) => sum + guestShareCents[g.id], 0);

    expect(Object.values(memberCents).reduce((a, b) => a + b, 0) + paidByGuests).toBe(10);
    for (const cents of Object.values(guestShareCents)) {
      expect(cents).toBeGreaterThanOrEqual(0);
    }
  });
});
