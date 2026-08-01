import { describe, it, expect } from "vitest";
import {
  refuseSwap,
  canSwap,
  callExhausted,
  passesNeeded,
  type SwapSide,
} from "@/lib/chore-swap";

const NOW = new Date("2026-08-01T12:00:00Z");
const LATER = new Date("2026-08-08T12:00:00Z");
const EARLIER = new Date("2026-07-25T12:00:00Z");

const side = (over: Partial<SwapSide> = {}): SwapSide => ({
  assignmentId: "a1",
  userId: "ibrahim",
  groupId: "flat",
  completedAt: null,
  periodEnd: LATER,
  ...over,
});

const mine = side();
const theirs = side({ assignmentId: "a2", userId: "lola" });

describe("refuseSwap", () => {
  it("allows a straightforward trade between two flatmates", () => {
    expect(refuseSwap({ mine, theirs, requesterId: "ibrahim", now: NOW })).toBeNull();
    expect(canSwap({ mine, theirs, requesterId: "ibrahim", now: NOW })).toBe(true);
  });

  it("refuses swapping a chore with itself", () => {
    expect(
      refuseSwap({ mine, theirs: mine, requesterId: "ibrahim", now: NOW }),
    ).toBe("sameAssignment");
  });

  it("refuses offering up a chore that isn't yours to give", () => {
    expect(refuseSwap({ mine, theirs, requesterId: "lola", now: NOW })).toBe("notYours");
  });

  it("refuses shuffling two of your own chores around", () => {
    expect(
      refuseSwap({
        mine,
        theirs: side({ assignmentId: "a2", userId: "ibrahim" }),
        requesterId: "ibrahim",
        now: NOW,
      }),
    ).toBe("samePerson");
  });

  it("refuses reaching into another group's chores", () => {
    expect(
      refuseSwap({
        mine,
        theirs: side({ assignmentId: "a2", userId: "lola", groupId: "office" }),
        requesterId: "ibrahim",
        now: NOW,
      }),
    ).toBe("differentGroups");
  });

  // Effort is credited on completion, so trading a finished chore would move
  // credit for work that's already done.
  it("refuses trading away something already done", () => {
    expect(
      refuseSwap({
        mine: side({ completedAt: EARLIER }),
        theirs,
        requesterId: "ibrahim",
        now: NOW,
      }),
    ).toBe("alreadyDone");
  });

  it("refuses trading for something the other person already finished", () => {
    expect(
      refuseSwap({
        mine,
        theirs: side({ assignmentId: "a2", userId: "lola", completedAt: EARLIER }),
        requesterId: "ibrahim",
        now: NOW,
      }),
    ).toBe("alreadyDone");
  });

  it("refuses a turn that has already run out", () => {
    expect(
      refuseSwap({
        mine: side({ periodEnd: EARLIER }),
        theirs,
        requesterId: "ibrahim",
        now: NOW,
      }),
    ).toBe("periodOver");
  });

  it("checks ownership before anything else, so the message is the useful one", () => {
    // Someone else's chore, in another group, already done — the thing they
    // most need to hear is that it isn't theirs to offer.
    expect(
      refuseSwap({
        mine: side({ userId: "lola", groupId: "office", completedAt: EARLIER }),
        theirs,
        requesterId: "ibrahim",
        now: NOW,
      }),
    ).toBe("notYours");
  });

  it("gives a reason for every refusal rather than a bare no", () => {
    const refusal = refuseSwap({ mine, theirs: mine, requesterId: "ibrahim", now: NOW });

    expect(typeof refusal).toBe("string");
    expect(refusal).not.toBe("");
  });
});

describe("callExhausted", () => {
  it("waits while somebody could still say yes", () => {
    // Four flatmates, so three others to hear from.
    expect(callExhausted(0, 4)).toBe(false);
    expect(callExhausted(1, 4)).toBe(false);
    expect(callExhausted(2, 4)).toBe(false);
  });

  it("gives up once everyone else has passed", () => {
    expect(callExhausted(3, 4)).toBe(true);
  });

  it("counts everyone except the person asking", () => {
    expect(passesNeeded(5)).toBe(4);
    expect(passesNeeded(2)).toBe(1);
  });

  it("closes a two-person group as soon as the other one passes", () => {
    expect(callExhausted(0, 2)).toBe(false);
    expect(callExhausted(1, 2)).toBe(true);
  });

  // Otherwise a call would close the instant it was posted, having been
  // refused by nobody.
  it("never closes a call in a group with nobody else in it", () => {
    expect(callExhausted(0, 1)).toBe(false);
    expect(passesNeeded(1)).toBe(0);
  });

  it("stays closed if a stray extra pass somehow lands", () => {
    expect(callExhausted(5, 4)).toBe(true);
  });
});
