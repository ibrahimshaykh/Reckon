import { describe, it, expect } from "vitest";
import {
  countsTowardLoad,
  countMissed,
  isMissed,
  listMissed,
  totalLoad,
  type LoadableAssignment,
} from "@/lib/chore-load";
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

describe("countMissed", () => {
  it("counts a turn that ran out unfinished", () => {
    expect(countMissed([at("lola", OVER, null)], NOW, ["lola"]).get("lola")).toBe(1);
  });

  it("does not count a turn still in hand", () => {
    // Not missed, just not finished yet. Calling it missed would accuse
    // somebody of dropping something they still have time to do.
    expect(countMissed([at("lola", RUNNING, null)], NOW, ["lola"]).get("lola")).toBe(0);
  });

  it("does not count work that was done", () => {
    expect(countMissed([at("lola", OVER, OVER)], NOW, ["lola"]).get("lola")).toBe(0);
  });

  it("forgets what happened long enough ago", () => {
    // A tally reaching back forever reads as a permanent mark against a
    // person rather than a description of the last few weeks.
    const ancient = new Date(NOW.getTime() - 90 * 86_400_000);

    expect(countMissed([at("lola", ancient, null)], NOW, ["lola"]).get("lola")).toBe(0);
  });

  it("keeps one from the edge of the window", () => {
    const justInside = new Date(NOW.getTime() - 29 * 86_400_000);

    expect(countMissed([at("lola", justInside, null)], NOW, ["lola"]).get("lola")).toBe(1);
  });

  it("shows nothing rather than nothing-to-report for a blameless member", () => {
    expect(countMissed([], NOW, ["saint"]).get("saint")).toBe(0);
  });

  it("agrees with the rule that drops the credit", () => {
    // The two are the same condition read from opposite sides. If they could
    // disagree, the group would be shown one story and the rotation would act
    // on another — which is the bug this whole day started with.
    for (const periodEnd of [OVER, RUNNING, NOW]) {
      for (const completedAt of [null, OVER]) {
        const a = { periodEnd, completedAt };
        expect(isMissed(a, NOW)).toBe(!countsTowardLoad(a, NOW));
      }
    }
  });
});

describe("listMissed", () => {
  const turn = (
    key: string,
    periodEnd: Date,
    completedAt: Date | null,
    choreName = "bins",
  ) => ({
    key,
    periodEnd,
    completedAt,
    choreName,
    effortWeight: 3,
    frequency: "WEEKLY" as const,
  });

  it("names the job and the day to go back to", () => {
    // Without both, the count is something you can read and not act on.
    const found = listMissed(
      [turn("lola", new Date("2026-07-31T00:00:00Z"), null, "clean the bathroom")],
      NOW,
      ["lola"],
    );

    expect(found.get("lola")).toEqual([
      {
        choreName: "clean the bathroom",
        effortWeight: 3,
        frequency: "WEEKLY",
        // The end is exclusive, so the day to open is the one before it.
        dueOn: "2026-07-30",
      },
    ]);
  });

  it("puts the most recent first", () => {
    // The one somebody is likeliest to remember doing, and likeliest to fix.
    const found = listMissed(
      [
        turn("lola", new Date("2026-07-20T00:00:00Z"), null, "older"),
        turn("lola", new Date("2026-08-01T00:00:00Z"), null, "newer"),
      ],
      NOW,
      ["lola"],
    );

    expect(found.get("lola")?.map((m) => m.choreName)).toEqual(["newer", "older"]);
  });

  it("leaves out anything finished or still in hand", () => {
    const found = listMissed(
      [turn("lola", OVER, OVER), turn("lola", RUNNING, null)],
      NOW,
      ["lola"],
    );

    expect(found.get("lola")).toEqual([]);
  });

  it("agrees with the count shown beside the name", () => {
    // Two ways of asking the same question. If they could differ, somebody
    // would be told they missed three things and shown two.
    const turns = [
      turn("lola", OVER, null),
      turn("lola", RUNNING, null),
      turn("lola", new Date("2026-07-28T00:00:00Z"), null),
      turn("ibrahim", OVER, OVER),
    ];

    const counted = countMissed(turns, NOW, ["lola", "ibrahim"]);
    const listed = listMissed(turns, NOW, ["lola", "ibrahim"]);

    for (const key of ["lola", "ibrahim"]) {
      expect(listed.get(key)?.length).toBe(counted.get(key));
    }
  });
});

describe("a chore the group removed", () => {
  const retiredTurn = {
    key: "ibrahim",
    // Cut short at the moment the chore was taken off the list, not at the
    // end of its day.
    periodEnd: new Date("2026-08-03T09:38:00Z"),
    completedAt: null,
    choreName: "monk cats",
    effortWeight: 8,
    frequency: "DAILY" as const,
    retired: true,
  };
  const now = new Date("2026-08-03T18:43:00Z");

  it("is not held against whoever was holding it", () => {
    // Removing a chore closes whatever turn is running — the whole point being
    // that nobody has to finish a job the group has just abandoned. Counting
    // that as missed blamed them for exactly the thing they were excused.
    expect(listMissed([retiredTurn], now, ["ibrahim"]).get("ibrahim")).toEqual([]);
  });

  it("still counts an ordinary turn the same person let lapse", () => {
    // The exemption is for the chore being withdrawn, not for the person.
    const ordinary = { ...retiredTurn, retired: false, choreName: "bins" };

    expect(
      listMissed([ordinary], now, ["ibrahim"]).get("ibrahim")?.map((m) => m.choreName),
    ).toEqual(["bins"]);
  });

  it("keeps the count and the list agreeing about it", () => {
    // The count is derived from the list, so an exemption applied in one place
    // must show in the other — otherwise somebody reads "1 missed" and opens
    // an empty list.
    const listed = listMissed([retiredTurn], now, ["ibrahim"]).get("ibrahim");
    expect(listed).toEqual([]);
  });
});
