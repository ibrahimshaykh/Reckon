import { describe, it, expect } from "vitest";
import { refuseLeave, canLeave } from "@/lib/leaving";

const squared = { isMember: true, alreadyLeft: false, balanceCents: 0 };

describe("refuseLeave", () => {
  it("lets someone go once they're square", () => {
    expect(refuseLeave(squared)).toBeNull();
    expect(canLeave(squared)).toBe(true);
  });

  it("holds them while they still owe", () => {
    expect(refuseLeave({ ...squared, balanceCents: -40000 })).toBe("owesMoney");
  });

  // The half people forget: walking out while you're owed money leaves whoever
  // owes it unable to clear their balance.
  it("holds them while they're still owed", () => {
    expect(refuseLeave({ ...squared, balanceCents: 40000 })).toBe("owedMoney");
  });

  it("holds them for a single stray penny, either way", () => {
    expect(refuseLeave({ ...squared, balanceCents: -1 })).toBe("owesMoney");
    expect(refuseLeave({ ...squared, balanceCents: 1 })).toBe("owedMoney");
  });

  it("says so if they were never in the group", () => {
    expect(refuseLeave({ ...squared, isMember: false })).toBe("notAMember");
  });

  it("says so if they already left", () => {
    expect(refuseLeave({ ...squared, alreadyLeft: true })).toBe("alreadyLeft");
  });

  it("checks membership before money, so the message is the useful one", () => {
    expect(
      refuseLeave({ isMember: false, alreadyLeft: true, balanceCents: -500 }),
    ).toBe("notAMember");
  });

  it("gives a reason rather than a bare refusal", () => {
    const refusal = refuseLeave({ ...squared, balanceCents: -100 });

    expect(typeof refusal).toBe("string");
    expect(refusal).not.toBe("");
  });
});
