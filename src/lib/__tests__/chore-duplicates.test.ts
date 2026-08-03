import { describe, it, expect } from "vitest";
import {
  findDuplicate,
  isSameChore,
  normaliseChoreName,
} from "@/lib/chore-duplicates";

const KILL_CAT = { name: "kill cat", effortWeight: 10, frequency: "WEEKLY" };

describe("isSameChore", () => {
  // The pair that prompted this: two "kill cat" chores, effort 10, weekly,
  // created a minute apart. Nothing on screen could separate them.
  it("catches an exact copy", () => {
    expect(isSameChore(KILL_CAT, { ...KILL_CAT })).toBe(true);
  });

  it("sees through casing and stray spacing", () => {
    // How the same chore actually gets typed twice.
    expect(isSameChore(KILL_CAT, { ...KILL_CAT, name: "Kill Cat" })).toBe(true);
    expect(isSameChore(KILL_CAT, { ...KILL_CAT, name: "  kill cat " })).toBe(true);
    expect(isSameChore(KILL_CAT, { ...KILL_CAT, name: "kill  cat" })).toBe(true);
  });

  it("allows the same name at a different frequency", () => {
    // A daily kitchen wipe and a weekly deep clean is a fair thing to want,
    // and the two read differently wherever the app names a chore.
    expect(isSameChore(KILL_CAT, { ...KILL_CAT, frequency: "DAILY" })).toBe(false);
  });

  it("allows the same name at a different effort", () => {
    expect(isSameChore(KILL_CAT, { ...KILL_CAT, effortWeight: 3 })).toBe(false);
  });

  it("keeps genuinely different chores apart", () => {
    expect(isSameChore(KILL_CAT, { ...KILL_CAT, name: "feed cat" })).toBe(false);
  });
});

describe("normaliseChoreName", () => {
  it("collapses the differences nobody would call meaningful", () => {
    expect(normaliseChoreName("  Take   Out  Trash ")).toBe("take out trash");
  });

  it("leaves a name that is already plain alone", () => {
    expect(normaliseChoreName("dishes")).toBe("dishes");
  });
});

describe("findDuplicate", () => {
  const list = [
    { id: "a", name: "kill cat", effortWeight: 10, frequency: "WEEKLY" },
    { id: "b", name: "kill cat", effortWeight: 10, frequency: "DAILY" },
    { id: "c", name: "feed cat", effortWeight: 1, frequency: "WEEKLY" },
  ];

  it("returns the chore that would be copied", () => {
    expect(
      findDuplicate(list, { name: "Kill Cat", effortWeight: 10, frequency: "WEEKLY" })?.id,
    ).toBe("a");
  });

  it("does not confuse the daily one with the weekly one", () => {
    expect(
      findDuplicate(list, { name: "kill cat", effortWeight: 10, frequency: "BIWEEKLY" }),
    ).toBeUndefined();
  });

  it("reports nothing for a genuinely new chore", () => {
    expect(
      findDuplicate(list, { name: "hoover", effortWeight: 5, frequency: "WEEKLY" }),
    ).toBeUndefined();
  });

  it("has nothing to clash with in an empty group", () => {
    expect(findDuplicate([], KILL_CAT)).toBeUndefined();
  });
});
