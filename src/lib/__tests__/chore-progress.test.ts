import { describe, it, expect } from "vitest";
import { periodProgress, type ProgressInput } from "@/lib/chore-progress";

const NOW = new Date("2026-08-04T12:00:00Z");
const LIVE_END = new Date("2026-08-05T00:00:00Z");
const STARTED = new Date("2026-08-04T00:00:00Z");

const turn = (
  key: string,
  frequency: ProgressInput["frequency"],
  effortWeight: number,
  completedAt: Date | null,
  periodEnd: Date = LIVE_END,
): ProgressInput => ({
  key,
  frequency,
  effortWeight,
  completedAt,
  periodStart: STARTED,
  periodEnd,
});

describe("periodProgress", () => {
  it("counts what is finished against what is held right now", () => {
    const [daily] = periodProgress(
      [
        turn("lola", "DAILY", 4, NOW),
        turn("lola", "DAILY", 6, null),
        turn("lola", "DAILY", 3, null),
      ],
      NOW,
      ["lola"],
    );

    expect(daily.people[0]).toEqual({ name: "lola", done: 4, total: 13, percent: 31 });
  });

  it("keeps each frequency in its own box", () => {
    // The reason for splitting them: a weekly chore somebody has until Sunday
    // to do dragged the same bar as the bins that need doing this evening, so
    // "am I finished for today" had no answer.
    const blocks = periodProgress(
      [turn("lola", "DAILY", 10, NOW), turn("lola", "WEEKLY", 10, null)],
      NOW,
      ["lola"],
    );

    expect(blocks.map((b) => b.frequency)).toEqual(["DAILY", "WEEKLY"]);
    expect(blocks[0].people[0].percent).toBe(100);
    expect(blocks[1].people[0].percent).toBe(0);
  });

  it("shows no box for a frequency the household doesn't use", () => {
    const blocks = periodProgress([turn("lola", "DAILY", 5, null)], NOW, ["lola"]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].frequency).toBe("DAILY");
  });

  it("leaves out turns that are over", () => {
    // Yesterday's work belongs to yesterday's round. Counting it would mean a
    // bar that never empties.
    const blocks = periodProgress(
      [turn("lola", "DAILY", 5, null, new Date("2026-08-04T00:00:00Z"))],
      NOW,
      ["lola"],
    );

    expect(blocks).toHaveLength(0);
  });

  it("leaves out turns that haven't begun", () => {
    const future = {
      ...turn("lola", "DAILY", 5, null, new Date("2026-08-07T00:00:00Z")),
      periodStart: new Date("2026-08-06T00:00:00Z"),
    };

    expect(periodProgress([future], NOW, ["lola"])).toHaveLength(0);
  });

  it("reads an empty round as nothing done, not as finished", () => {
    // A full bar would congratulate somebody for a round they were never
    // given.
    const [daily] = periodProgress(
      [turn("lola", "DAILY", 5, null)],
      NOW,
      ["lola", "ibrahim"],
    );
    const idle = daily.people.find((p) => p.name === "ibrahim");

    expect(idle).toEqual({ name: "ibrahim", done: 0, total: 0, percent: 0 });
  });

  it("reaches exactly 100 when everything held is done", () => {
    const [daily] = periodProgress(
      [turn("lola", "DAILY", 7, NOW), turn("lola", "DAILY", 3, NOW)],
      NOW,
      ["lola"],
    );

    expect(daily.people[0]).toMatchObject({ done: 10, total: 10, percent: 100 });
  });

  it("keeps everyone in the group in every box, even with nothing to do", () => {
    // Otherwise a person vanishes from the board on the days they happen to
    // hold nothing, which reads as them having been dropped from the rota.
    const [daily] = periodProgress(
      [turn("lola", "DAILY", 5, null)],
      NOW,
      ["lola", "ibrahim"],
    );

    expect(daily.people.map((p) => p.name)).toEqual(["lola", "ibrahim"]);
  });
});
