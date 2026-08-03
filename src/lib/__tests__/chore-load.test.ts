import { describe, it, expect } from "vitest";
import { countsTowardLoad, totalLoad, type LoadableAssignment } from "@/lib/chore-load";
import { weightedEffort } from "@/lib/chore-weight";

const NOW = new Date("2026-08-03T12:00:00Z");
const RUNNING = new Date("2026-08-05T12:00:00Z");
const OVER = new Date("2026-08-01T12:00:00Z");

const at = (
  key: string,
  periodEnd: Date,
  completedAt: Date | null,
  effortWeight = 10,
): LoadableAssignment => ({
  key,
  periodEnd,
  completedAt,
  effortWeight,
  frequency: "WEEKLY",
});

describe("countsTowardLoad", () => {
  it("counts a chore you are still on the hook for, done or not", () => {
    // Otherwise someone mid-period reads as empty and the next few chores all
    // land on them before they have had a chance to finish anything.
    expect(countsTowardLoad({ periodEnd: RUNNING, completedAt: null }, NOW)).toBe(true);
    expect(countsTowardLoad({ periodEnd: RUNNING, completedAt: NOW }, NOW)).toBe(true);
  });

  it("keeps counting finished work after the period ends", () => {
    expect(countsTowardLoad({ periodEnd: OVER, completedAt: OVER }, NOW)).toBe(true);
  });

  it("stops counting a chore whose time ran out unfinished", () => {
    // The whole point: being handed a job was worth as much as doing it, so
    // somebody could collect ten chores, do none, and be read as fully loaded.
    expect(countsTowardLoad({ periodEnd: OVER, completedAt: null }, NOW)).toBe(false);
  });

  it("treats a period ending exactly now as still running", () => {
    expect(countsTowardLoad({ periodEnd: NOW, completedAt: null }, NOW)).toBe(true);
  });
});

describe("totalLoad", () => {
  it("ignores work that was skipped", () => {
    const totals = totalLoad(
      [
        at("diligent", OVER, OVER),
        at("slacker", OVER, null),
        at("slacker", OVER, null),
        at("slacker", OVER, null),
      ],
      NOW,
    );

    expect(totals.get("diligent")).toBe(weightedEffort(10, "WEEKLY"));
    // Three chores collected and none done still counts for nothing, so the
    // next one comes their way rather than the person who actually cleaned.
    expect(totals.get("slacker")).toBeUndefined();
  });

  it("puts the person who skipped behind, so they get the next chore", () => {
    const totals = totalLoad(
      [at("did-it", OVER, OVER, 10), at("skipped-it", OVER, null, 10)],
      NOW,
      ["did-it", "skipped-it"],
    );

    expect(totals.get("skipped-it")).toBeLessThan(totals.get("did-it")!);
  });

  it("does not dogpile someone part-way through a round", () => {
    // Three unfinished chores in hand. Counting only completed work would read
    // this person as empty and send them a fourth.
    const totals = totalLoad(
      [
        at("busy", RUNNING, null),
        at("busy", RUNNING, null),
        at("busy", RUNNING, null),
        at("idle", OVER, OVER),
      ],
      NOW,
      ["busy", "idle"],
    );

    expect(totals.get("busy")).toBeGreaterThan(totals.get("idle")!);
  });

  it("does not jump when a finished chore's period expires", () => {
    const before = totalLoad([at("a", RUNNING, NOW)], NOW).get("a");
    const after = totalLoad([at("a", OVER, OVER)], NOW).get("a");

    // Finishing early must not change anything, or there is a way to game it.
    expect(before).toBe(after);
  });

  it("shows someone with no history at zero rather than omitting them", () => {
    const totals = totalLoad([], NOW, ["newcomer"]);

    expect(totals.get("newcomer")).toBe(0);
  });

  it("weights by frequency, not by raw effort", () => {
    const totals = totalLoad(
      [
        { ...at("daily", RUNNING, null, 10), frequency: "DAILY" },
        { ...at("weekly", RUNNING, null, 10), frequency: "WEEKLY" },
      ],
      NOW,
    );

    expect(totals.get("daily")).toBe(totals.get("weekly")! * 7);
  });
});
