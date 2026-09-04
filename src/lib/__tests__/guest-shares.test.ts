import { describe, it, expect } from "vitest";
import {
  deriveItemShares,
  guestLockReason,
  guestLockHolder,
  lockedMessage,
  toShareRatios,
  type GuestStatus,
  type GuestShareInput,
} from "@/lib/guest-shares";
import { computeBalances, computeSettlements } from "@/lib/settlement";

// The running example throughout: Ibrahim pays 1.50 for a coke shared by
// himself, Lola, and Sara — a guest neither of them has an account for.
const coke = (status: GuestStatus) =>
  deriveItemShares({
    totalCents: 150,
    memberIds: ["ibrahim", "lola"],
    guests: [{ id: "sara", status, hostIds: ["ibrahim", "lola"] }],
  });

describe("deriveItemShares", () => {
  it("counts a guest as a head, then puts their share on their hosts", () => {
    const { memberCents, guestShareCents, groupTotalCents } = coke("UNDECIDED");

    // 150 over 3 heads is 50 each; Sara's 50 splits back over her two hosts.
    expect(memberCents).toEqual({ ibrahim: 75, lola: 75 });
    // Sara is still shown her 50 — that's what the group is carrying for her.
    expect(guestShareCents).toEqual({ sara: 50 });
    expect(groupTotalCents).toBe(150);
  });

  it("drops a paid guest's share out of the group total", () => {
    const { memberCents, guestShareCents, groupTotalCents } = coke("PAID");

    expect(memberCents).toEqual({ ibrahim: 50, lola: 50 });
    expect(guestShareCents).toEqual({ sara: 50 });
    // The group is only accountable for its own two heads now.
    expect(groupTotalCents).toBe(100);
  });

  it.each<GuestStatus>(["UNDECIDED", "PAYING", "DECLINED"])(
    "treats %s exactly like unpaid — only PAID moves the ledger",
    (status) => {
      expect(coke(status)).toEqual(coke("UNDECIDED"));
    },
  );

  it("splits an unpaid guest onto a single host alone", () => {
    const { memberCents } = deriveItemShares({
      totalCents: 150,
      memberIds: ["ibrahim", "lola"],
      guests: [{ id: "sara", status: "UNDECIDED", hostIds: ["lola"] }],
    });

    // Lola brought her, so Lola carries the whole 50.
    expect(memberCents).toEqual({ ibrahim: 50, lola: 100 });
  });

  it("handles several guests with different answers at once", () => {
    const { memberCents, guestShareCents, groupTotalCents } = deriveItemShares({
      totalCents: 400,
      memberIds: ["ibrahim", "lola"],
      guests: [
        { id: "sara", status: "PAID", hostIds: ["lola"] },
        { id: "tom", status: "DECLINED", hostIds: ["ibrahim"] },
      ],
    });

    // 400 over 4 heads = 100 each. Sara pays hers; Tom's lands on Ibrahim.
    expect(guestShareCents).toEqual({ sara: 100, tom: 100 });
    expect(memberCents).toEqual({ ibrahim: 200, lola: 100 });
    expect(groupTotalCents).toBe(300);
  });

  it("falls back to the whole table when a guest's hosts left the split", () => {
    const { memberCents, groupTotalCents } = deriveItemShares({
      totalCents: 300,
      memberIds: ["ibrahim", "lola"],
      guests: [{ id: "sara", status: "UNDECIDED", hostIds: ["someone-removed"] }],
    });

    // The stranded 100 must not silently disappear from the total.
    expect(memberCents).toEqual({ ibrahim: 150, lola: 150 });
    expect(groupTotalCents).toBe(300);
  });

  it("leaves a guest-free item as a plain equal split", () => {
    const { memberCents, guestShareCents, groupTotalCents } = deriveItemShares({
      totalCents: 999,
      memberIds: ["a", "b", "c"],
      guests: [],
    });

    expect(memberCents).toEqual({ a: 333, b: 333, c: 333 });
    expect(guestShareCents).toEqual({});
    expect(groupTotalCents).toBe(999);
  });

  it("spreads leftover pennies one each instead of onto one person", () => {
    const { memberCents } = deriveItemShares({
      totalCents: 100,
      memberIds: ["a", "b", "c"],
      guests: [],
    });

    // 100/3 leaves one penny over — nobody should be 2c off their neighbour.
    expect(Object.values(memberCents).sort()).toEqual([33, 33, 34]);
  });

  it("gives the same answer whatever order the rows arrive in", () => {
    const forwards = deriveItemShares({
      totalCents: 100,
      memberIds: ["a", "b", "c"],
      guests: [],
    });
    const backwards = deriveItemShares({
      totalCents: 100,
      memberIds: ["c", "b", "a"],
      guests: [],
    });

    expect(forwards).toEqual(backwards);
  });

  // Every cent of the bill has to end up charged to exactly one person: a
  // member, or a guest who paid it directly. A penny falling out here is a
  // penny somebody is silently eating, so sweep a wide range of totals
  // rather than trusting a couple of hand-picked ones.
  it("never loses or invents a cent, for any total", () => {
    for (let totalCents = 1; totalCents <= 2000; totalCents++) {
      for (const status of ["UNDECIDED", "PAYING", "PAID", "DECLINED"] as const) {
        const guests: GuestShareInput[] = [
          { id: "g1", status, hostIds: ["a"] },
          { id: "g2", status: "UNDECIDED", hostIds: ["b", "c"] },
        ];

        const { memberCents, guestShareCents, groupTotalCents } = deriveItemShares({
          totalCents,
          memberIds: ["a", "b", "c"],
          guests,
        });

        const paidByGuests = guests
          .filter((g) => g.status === "PAID")
          .reduce((sum, g) => sum + guestShareCents[g.id], 0);
        const owedByMembers = Object.values(memberCents).reduce((x, y) => x + y, 0);

        expect(owedByMembers + paidByGuests).toBe(totalCents);
        // The payer must be credited exactly what the members are charged,
        // or the group ends up with a phantom debtor or creditor.
        expect(groupTotalCents).toBe(owedByMembers);
      }
    }
  });

  it("refuses an item with no members to carry it", () => {
    expect(() =>
      deriveItemShares({ totalCents: 100, memberIds: [], guests: [] }),
    ).toThrow(/at least one member/);
  });

  it("refuses a guest id that collides with a member id", () => {
    expect(() =>
      deriveItemShares({
        totalCents: 100,
        memberIds: ["ibrahim"],
        guests: [{ id: "ibrahim", status: "UNDECIDED", hostIds: ["ibrahim"] }],
      }),
    ).toThrow(/collides/);
  });
});

describe("guestHostSplit — who is actually out of pocket for a guest", () => {
  it("splits an unpaid guest's share evenly across their hosts", () => {
    const { guestHostSplit } = coke("UNDECIDED");

    // This is what Sara would owe each of them if she insisted on paying
    // after they'd already covered her.
    expect(guestHostSplit.sara).toEqual({ ibrahim: 25, lola: 25 });
  });

  it("puts the whole share on a lone host", () => {
    const { guestHostSplit } = deriveItemShares({
      totalCents: 150,
      memberIds: ["ibrahim", "lola"],
      guests: [{ id: "sara", status: "UNDECIDED", hostIds: ["lola"] }],
    });

    expect(guestHostSplit.sara).toEqual({ lola: 50 });
  });

  it("leaves nobody carrying a guest who paid their own way", () => {
    const { guestHostSplit } = coke("PAID");

    expect(guestHostSplit.sara).toEqual({});
  });

  it("always adds up to exactly the guest's share", () => {
    for (let totalCents = 1; totalCents <= 1000; totalCents++) {
      const { guestShareCents, guestHostSplit } = deriveItemShares({
        totalCents,
        memberIds: ["a", "b", "c"],
        guests: [{ id: "g", status: "UNDECIDED", hostIds: ["a", "b"] }],
      });

      const carried = Object.values(guestHostSplit.g).reduce((x, y) => x + y, 0);
      expect(carried).toBe(guestShareCents.g);
    }
  });
});

describe("guestLockReason", () => {
  it("locks once a guest is on their way to paying", () => {
    expect(guestLockReason(["UNDECIDED", "PAYING"])).toBe("PAYING");
  });

  it("locks once a guest has paid", () => {
    expect(guestLockReason(["PAID"])).toBe("PAID");
  });

  it("reports PAID over PAYING, since that's the firmer reason", () => {
    expect(guestLockReason(["PAYING", "PAID"])).toBe("PAID");
  });

  it("leaves the expense editable while everyone's still deciding", () => {
    expect(guestLockReason(["UNDECIDED", "DECLINED"])).toBeNull();
  });

  it("leaves a guest-free expense editable", () => {
    expect(guestLockReason([])).toBeNull();
  });
});

describe("guestLockHolder", () => {
  it("names the guest holding the lock", () => {
    expect(
      guestLockHolder([
        { status: "UNDECIDED", name: "abdullah" },
        { status: "PAID", name: "taha" },
      ]),
    ).toEqual({ reason: "PAID", name: "taha" });
  });

  it("names the firmest guest, not the first", () => {
    expect(
      guestLockHolder([
        { status: "PAYING", name: "sara" },
        { status: "PAID", name: "taha" },
      ]),
    ).toEqual({ reason: "PAID", name: "taha" });
  });

  it("is null when nobody has committed anything", () => {
    expect(
      guestLockHolder([
        { status: "UNDECIDED", name: "abdullah" },
        { status: "DECLINED", name: "jordan" },
      ]),
    ).toBeNull();
  });
});

describe("lockedMessage", () => {
  // The bug this replaced: one present-tense sentence for all three states,
  // so a guest who had already paid was described as "is paying".
  it("uses the past tense once the guest has paid", () => {
    expect(
      lockedMessage({ reason: "PAID", name: "taha" }, "the split can't change"),
    ).toBe("taha has already paid their share, so the split can't change.");
  });

  it("uses the present tense while they're still paying", () => {
    expect(
      lockedMessage({ reason: "PAYING", name: "taha" }, "the split can't change"),
    ).toBe("taha is paying their share right now, so the split can't change.");
  });

  it("says a sent share is still waiting on confirmation", () => {
    expect(lockedMessage({ reason: "SENT", name: "sara" }, "it's locked")).toBe(
      "sara has sent their share and it hasn't been confirmed yet, so it's locked.",
    );
  });
});

describe("toShareRatios", () => {
  it("converts member cents into ratios of the group's own total", () => {
    const { memberCents, groupTotalCents } = coke("UNDECIDED");
    const ratios = toShareRatios(memberCents, groupTotalCents);

    expect(ratios).toEqual({ ibrahim: 0.5, lola: 0.5 });
  });

  it("still sums to 1 when every guest paid and the group owes nothing", () => {
    const ratios = toShareRatios({ a: 0, b: 0 }, 0);

    expect(Object.values(ratios).reduce((x, y) => x + y, 0)).toBeCloseTo(1);
  });
});

describe("guest shares feeding the settlement engine", () => {
  it("leaves Lola owing Ibrahim the full half while Sara is undecided", () => {
    const { memberCents, groupTotalCents } = coke("UNDECIDED");

    const settlements = computeSettlements(
      computeBalances([
        {
          paidById: "ibrahim",
          totalCents: groupTotalCents,
          participants: Object.entries(
            toShareRatios(memberCents, groupTotalCents),
          ).map(([userId, shareRatio]) => ({ userId, shareRatio })),
        },
      ]),
    );

    expect(
      settlements.map(({ fromUserId, toUserId, amountCents }) => ({
        fromUserId,
        toUserId,
        amountCents,
      })),
    ).toEqual([{ fromUserId: "lola", toUserId: "ibrahim", amountCents: 75 }]);
  });

  it("drops Lola's debt to her own share once Sara pays", () => {
    const { memberCents, groupTotalCents } = coke("PAID");

    const settlements = computeSettlements(
      computeBalances([
        {
          paidById: "ibrahim",
          // Crediting the payer with the group total, not the item total, is
          // what keeps Sara's 50 out of the group's books — credit him 150
          // here and Lola would silently owe him 75 for a coke Sara paid for.
          totalCents: groupTotalCents,
          participants: Object.entries(
            toShareRatios(memberCents, groupTotalCents),
          ).map(([userId, shareRatio]) => ({ userId, shareRatio })),
        },
      ]),
    );

    expect(
      settlements.map(({ fromUserId, toUserId, amountCents }) => ({
        fromUserId,
        toUserId,
        amountCents,
      })),
    ).toEqual([{ fromUserId: "lola", toUserId: "ibrahim", amountCents: 50 }]);
  });
});
