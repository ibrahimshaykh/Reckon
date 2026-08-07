import { describe, it, expect } from "vitest";
import { deriveItemShares, toShareRatios, type GuestStatus } from "@/lib/guest-shares";
import { computeBalances, computeSettlements } from "@/lib/settlement";

// The live "burgers" expense, with two guests whose hosts differ:
//
//   Rs 700, paid by Ibrahim, shared by Ibrahim and Lola
//   sara — guest of Ibrahim only
//   ali  — guest of Ibrahim and Lola
//
// Four heads, so Rs 175 each. The interesting part is that the two guests
// are carried differently, so their answers move the ledger differently.
function burgers(sara: GuestStatus, ali: GuestStatus) {
  const { memberCents, guestShareCents, groupTotalCents } = deriveItemShares({
    totalCents: 70000,
    memberIds: ["ibrahim", "lola"],
    guests: [
      { id: "sara", status: sara, hostIds: ["ibrahim"] },
      { id: "ali", status: ali, hostIds: ["ibrahim", "lola"] },
    ],
  });

  const settlements = computeSettlements(
    computeBalances([
      {
        paidById: "ibrahim",
        totalCents: groupTotalCents,
        participants: Object.entries(toShareRatios(memberCents, groupTotalCents)).map(
          ([userId, shareRatio]) => ({ userId, shareRatio }),
        ),
      },
    ]),
  );

  return {
    memberCents,
    guestShareCents,
    groupTotalCents,
    owes: settlements.map((s) => ({
      from: s.fromUserId,
      to: s.toUserId,
      amountCents: s.amountCents,
    })),
  };
}

describe("two guests with different hosts", () => {
  it("quotes both guests the same Rs 175, since a head is a head", () => {
    const { guestShareCents } = burgers("UNDECIDED", "UNDECIDED");

    expect(guestShareCents).toEqual({ sara: 17500, ali: 17500 });
  });

  it("neither pays: Ibrahim carries sara alone, ali is halved", () => {
    const { memberCents, owes } = burgers("UNDECIDED", "UNDECIDED");

    // Ibrahim: own 175 + all of sara's 175 + half of ali's 87.50
    // Lola:    own 175 + half of ali's 87.50
    expect(memberCents).toEqual({ ibrahim: 43750, lola: 26250 });
    expect(owes).toEqual([{ from: "lola", to: "ibrahim", amountCents: 26250 }]);
  });

  it("declining is the same as not answering — the hosts still carry it", () => {
    expect(burgers("DECLINED", "DECLINED")).toEqual(burgers("UNDECIDED", "UNDECIDED"));
  });

  it("saying they'll pay changes nothing until the money lands", () => {
    expect(burgers("PAYING", "PAYING")).toEqual(burgers("UNDECIDED", "UNDECIDED"));
  });

  // The rule the whole "I've sent it" step depends on. A guest saying the
  // money has gone is a claim about their own bank, not an arrival in
  // somebody else's — and if the ledger moved on the claim, a wrong account
  // number or a change of heart would rewrite balances everyone had already
  // seen and acted on. Only the payer confirming counts.
  it("saying they've SENT it still changes nothing — only receipt does", () => {
    expect(burgers("SENT", "SENT")).toEqual(burgers("UNDECIDED", "UNDECIDED"));
    expect(burgers("SENT", "SENT")).toEqual(burgers("PAYING", "PAYING"));

    // And the moment it is confirmed, it does move.
    expect(burgers("PAID", "PAID")).not.toEqual(burgers("SENT", "SENT"));
  });

  // The one people get wrong: sara pays, but Lola's number doesn't move.
  it("sara paying leaves Lola exactly where she was", () => {
    const unpaid = burgers("UNDECIDED", "UNDECIDED");
    const saraPaid = burgers("PAID", "UNDECIDED");

    expect(saraPaid.owes).toEqual([{ from: "lola", to: "ibrahim", amountCents: 26250 }]);
    expect(saraPaid.owes).toEqual(unpaid.owes);

    // Because Lola never carried any of sara — Ibrahim did, and he's also the
    // one sara paid, so it cancels out on his side alone.
    expect(saraPaid.memberCents.lola).toBe(unpaid.memberCents.lola);
    expect(saraPaid.memberCents.ibrahim).toBe(unpaid.memberCents.ibrahim - 17500);
  });

  it("ali paying drops Lola by exactly the half she was carrying", () => {
    const { memberCents, owes } = burgers("UNDECIDED", "PAID");

    expect(memberCents).toEqual({ ibrahim: 35000, lola: 17500 });
    expect(owes).toEqual([{ from: "lola", to: "ibrahim", amountCents: 17500 }]);
  });

  it("both paying leaves everyone with just their own share", () => {
    const { memberCents, groupTotalCents, owes } = burgers("PAID", "PAID");

    expect(memberCents).toEqual({ ibrahim: 17500, lola: 17500 });
    expect(groupTotalCents).toBe(35000);
    expect(owes).toEqual([{ from: "lola", to: "ibrahim", amountCents: 17500 }]);
  });

  it("one pays and one refuses", () => {
    const { memberCents, owes } = burgers("PAID", "DECLINED");

    // sara's 175 gone; ali's 175 split between his two hosts.
    expect(memberCents).toEqual({ ibrahim: 26250, lola: 26250 });
    expect(owes).toEqual([{ from: "lola", to: "ibrahim", amountCents: 26250 }]);
  });

  // Whatever the guests decide, the real money has to reconcile: once
  // everyone has settled, each person is out of pocket exactly what the
  // ledger said they owed — no more, no less. Note that's their own share
  // PLUS anything they're still carrying for a guest who hasn't paid, which
  // is the whole point of hosting.
  it.each([
    ["UNDECIDED", "UNDECIDED"],
    ["PAID", "UNDECIDED"],
    ["UNDECIDED", "PAID"],
    ["PAID", "PAID"],
    ["DECLINED", "PAYING"],
    ["PAYING", "PAID"],
  ] as [GuestStatus, GuestStatus][])(
    "everyone is out of pocket exactly what they owed (sara=%s, ali=%s)",
    (sara, ali) => {
      const { memberCents, guestShareCents, owes } = burgers(sara, ali);

      const fromGuests =
        (sara === "PAID" ? guestShareCents.sara : 0) +
        (ali === "PAID" ? guestShareCents.ali : 0);
      const fromLola = owes
        .filter((o) => o.from === "lola" && o.to === "ibrahim")
        .reduce((sum, o) => sum + o.amountCents, 0);

      // Ibrahim laid out 700 and is repaid by the guests who paid, plus Lola.
      expect(70000 - fromGuests - fromLola).toBe(memberCents.ibrahim);
      // Lola pays exactly her side of the ledger and nothing else.
      expect(fromLola).toBe(memberCents.lola);
      // And nobody's money went missing along the way.
      expect(memberCents.ibrahim + memberCents.lola + fromGuests).toBe(70000);
    },
  );
});
