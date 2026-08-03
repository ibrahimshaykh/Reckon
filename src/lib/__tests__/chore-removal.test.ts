import { describe, it, expect } from "vitest";
import { planRemoval } from "@/lib/chore-removal";
import { totalLoad, type LoadableAssignment } from "@/lib/chore-load";
import { weightedEffort } from "@/lib/chore-weight";

const NOW = new Date("2026-08-03T12:00:00Z");
const LATER = new Date("2026-08-03T12:00:01Z");
const RUNNING = new Date("2026-08-10T12:00:00Z");
const DONE = new Date("2026-08-02T12:00:00Z");

describe("planRemoval", () => {
  it("deletes a chore nobody was ever given", () => {
    expect(planRemoval(0)).toBe("delete");
  });

  it("retires a chore that has been handed out", () => {
    // Even once. Assignments cascade from the chore, so deleting it would take
    // the record of the work with it.
    expect(planRemoval(1)).toBe("retire");
    expect(planRemoval(40)).toBe("retire");
  });
});

describe("retiring a chore", () => {
  const bathroom = (
    completedAt: Date | null,
    periodEnd: Date,
  ): LoadableAssignment => ({
    key: "lola",
    completedAt,
    periodEnd,
    effortWeight: 10,
    frequency: "DAILY",
  });

  it("leaves credit for work already done on it", () => {
    // The point of retiring rather than deleting: someone who cleaned the
    // bathroom every week must not read as having done nothing the moment the
    // chore is tidied off the list.
    const before = totalLoad([bathroom(DONE, DONE)], NOW).get("lola");
    const after = totalLoad([bathroom(DONE, DONE)], LATER).get("lola");

    expect(before).toBe(weightedEffort(10, "DAILY"));
    expect(after).toBe(before);
  });

  it("stops charging anyone for the turn that was still running", () => {
    // Retiring closes the open period. Nobody has to finish a chore the group
    // has just abandoned, so it should stop counting against them.
    // Seeded with the member, the way the real call sites do, so a total of
    // nothing reads as zero rather than as an absent person.
    const whileLive = totalLoad([bathroom(null, RUNNING)], NOW, ["lola"]).get("lola");
    const onceRetired = totalLoad([bathroom(null, NOW)], LATER, ["lola"]).get("lola");

    expect(whileLive).toBe(weightedEffort(10, "DAILY"));
    expect(onceRetired).toBe(0);
  });

  it("does not take away credit for a turn that was finished early", () => {
    // Closing the period must not punish someone who had already done it.
    expect(totalLoad([bathroom(DONE, NOW)], LATER).get("lola")).toBe(
      weightedEffort(10, "DAILY"),
    );
  });
});
