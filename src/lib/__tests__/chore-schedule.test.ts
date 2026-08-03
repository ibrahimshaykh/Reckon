import { describe, it, expect } from "vitest";
import {
  dayWindow,
  occurrenceOn,
  overlapsDay,
  periodLengthDays,
  projectPeriod,
  markDoneBlock,
  periodEndFor,
  lastCoveredDay,
  startOfUtcDay,
  toIsoDate,
} from "@/lib/chore-schedule";

const day = (iso: string) => dayWindow(iso)!;
const at = (iso: string) => new Date(`${iso}Z`);

// The live group's shape: turns handed out on 2 Aug at 17:35.
const HANDED_OUT = at("2026-08-02T17:35:00");

describe("dayWindow", () => {
  it("covers the whole calendar day", () => {
    const d = day("2026-08-06");

    expect(d.start.toISOString()).toBe("2026-08-06T00:00:00.000Z");
    expect(d.end.toISOString()).toBe("2026-08-07T00:00:00.000Z");
  });

  it("refuses anything that isn't a plain date", () => {
    // It arrives from the URL, where anyone can type anything.
    for (const bad of ["", "today", "2026-8-6", "06/08/2026", "2026-13-45"]) {
      expect(dayWindow(bad)).toBeNull();
    }
  });

  it("round-trips with toIsoDate", () => {
    expect(toIsoDate(day("2026-08-06").start)).toBe("2026-08-06");
  });
});

describe("overlapsDay", () => {
  it("counts a turn that runs into the day from the night before", () => {
    // Handed out at 17:35 on the 2nd, a daily chore is still outstanding for
    // most of the 3rd. Hiding it there would drop a job somebody still owes.
    const period = { start: HANDED_OUT, end: at("2026-08-03T17:35:00") };

    expect(overlapsDay(period, day("2026-08-02"))).toBe(true);
    expect(overlapsDay(period, day("2026-08-03"))).toBe(true);
    expect(overlapsDay(period, day("2026-08-04"))).toBe(false);
  });

  it("excludes a turn that ends exactly at midnight", () => {
    // Half-open, so a turn ending at 00:00 belongs to the day before and is
    // not counted twice.
    const period = { start: at("2026-08-02T00:00:00"), end: at("2026-08-03T00:00:00") };

    expect(overlapsDay(period, day("2026-08-02"))).toBe(true);
    expect(overlapsDay(period, day("2026-08-03"))).toBe(false);
  });
});

describe("the question this feature had to answer", () => {
  // Turns handed out on 2 Aug. Somebody picks 6 Aug: what do they see?
  const assignments = (frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY") => [
    {
      periodStart: HANDED_OUT,
      periodEnd: new Date(
        HANDED_OUT.getTime() + periodLengthDays(frequency) * 86_400_000,
      ),
    },
  ];
  const chore = (frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY") => ({
    frequency,
    createdAt: HANDED_OUT,
  });
  const sixth = day("2026-08-06");

  it("shows the weekly turn, because the 6th falls inside it", () => {
    const found = occurrenceOn(chore("WEEKLY"), assignments("WEEKLY"), sixth);

    expect(found?.assignment).not.toBeNull();
    // Due by the 9th, not on the 6th — which is why the row prints the window.
    expect(found?.period.end.toISOString()).toBe("2026-08-09T17:35:00.000Z");
  });

  it("shows the biweekly and monthly turns for the same reason", () => {
    expect(
      occurrenceOn(chore("BIWEEKLY"), assignments("BIWEEKLY"), sixth)?.period.end,
    ).toEqual(at("2026-08-16T17:35:00"));
    expect(
      occurrenceOn(chore("MONTHLY"), assignments("MONTHLY"), sixth)?.period.end,
    ).toEqual(at("2026-09-01T17:35:00"));
  });

  it("still shows the daily chore, as a turn nobody holds yet", () => {
    // Its 2 Aug turn ended long before the 6th. Rotation is manual, so no real
    // turn exists — but the chore has not stopped happening, and an empty page
    // would read as the app having lost it.
    const found = occurrenceOn(chore("DAILY"), assignments("DAILY"), sixth);

    expect(found).not.toBeNull();
    expect(found?.assignment).toBeNull();
    // A daily turn inherits the 17:35 handover, so two of them touch the 6th.
    // The one returned is the earlier, which covers most of that date.
    expect(overlapsDay(found!.period, sixth)).toBe(true);
    expect(found?.period.start.toISOString()).toBe("2026-08-05T17:35:00.000Z");
  });
});

describe("projectPeriod", () => {
  it("lands on the turn that covers the day, however far ahead", () => {
    const period = projectPeriod(HANDED_OUT, "DAILY", day("2026-09-15"))!;

    expect(period.start.getTime()).toBeLessThan(day("2026-09-16").start.getTime());
    expect(period.end.getTime()).toBeGreaterThan(day("2026-09-15").start.getTime());
  });

  it("keeps the rhythm's own offset rather than snapping to midnight", () => {
    // Turns continue from when the last one ended, so a chore handed out at
    // 17:35 keeps rolling over at 17:35.
    const period = projectPeriod(HANDED_OUT, "WEEKLY", day("2026-08-20"))!;

    expect(period.start.toISOString()).toBe("2026-08-16T17:35:00.000Z");
  });

  it("projects nothing into a day that ended before the rhythm resumed", () => {
    // The past belongs to real turns; inventing one would rewrite history.
    expect(projectPeriod(HANDED_OUT, "DAILY", day("2026-07-30"))).toBeNull();
  });
});

describe("occurrenceOn", () => {
  const chore = { frequency: "DAILY" as const, createdAt: at("2026-08-02T17:35:00") };

  it("prefers the real turn over the projected one", () => {
    const real = {
      periodStart: HANDED_OUT,
      periodEnd: at("2026-08-03T17:35:00"),
      id: "real",
    };
    const found = occurrenceOn(chore, [real], day("2026-08-03"));

    expect(found?.assignment?.id).toBe("real");
  });

  it("shows nothing before the chore existed", () => {
    expect(occurrenceOn(chore, [], day("2026-07-01"))).toBeNull();
  });

  it("projects from the chore's own start when it has never been handed out", () => {
    const found = occurrenceOn(chore, [], day("2026-08-04"));

    expect(found?.assignment).toBeNull();
    expect(overlapsDay(found!.period, day("2026-08-04"))).toBe(true);
  });

  it("always returns a turn that really covers the day it was asked about", () => {
    // The property that matters, checked across a long stretch rather than at
    // one hand-picked date: whatever comes back must be live on that day, or
    // the row is answering a different question than the one asked.
    for (let offset = 0; offset < 60; offset++) {
      const iso = toIsoDate(new Date(at("2026-08-03T00:00:00").getTime() + offset * 86_400_000));
      for (const frequency of ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"] as const) {
        const found = occurrenceOn({ frequency, createdAt: chore.createdAt }, [], day(iso));
        expect(found, iso).not.toBeNull();
        expect(overlapsDay(found!.period, day(iso)), `${frequency} on ${iso}`).toBe(true);
      }
    }
  });
});

describe("markDoneBlock", () => {
  const now = at("2026-08-03T12:00:00");

  it("allows a weekly chore to be done early", () => {
    // The whole point of not blocking until the deadline: doing your job on
    // Tuesday when it is due Sunday is the behaviour worth encouraging.
    expect(
      markDoneBlock({ periodStart: at("2026-08-02T00:00:00"), completedAt: null }, now),
    ).toBeNull();
  });

  it("refuses a turn that has not begun", () => {
    expect(
      markDoneBlock({ periodStart: at("2026-08-10T00:00:00"), completedAt: null }, now),
    ).toBe("notStarted");
  });

  it("refuses a turn nobody holds", () => {
    expect(markDoneBlock(null, now)).toBe("unassigned");
  });

  it("refuses one that is already done", () => {
    expect(
      markDoneBlock({ periodStart: at("2026-08-02T00:00:00"), completedAt: now }, now),
    ).toBe("alreadyDone");
  });
});

describe("turns cover whole days", () => {
  // The reported bug: Rotate pressed at 21:04 gave a "daily" turn running to
  // 21:04 the next evening, so it was live on two dates and showed on both.
  const pressedLate = at("2026-08-03T21:04:00");

  it("ends a daily turn at the end of the day it began", () => {
    expect(periodEndFor(pressedLate, "DAILY").toISOString()).toBe(
      "2026-08-04T00:00:00.000Z",
    );
  });

  it("puts a daily chore on exactly one date", () => {
    const end = periodEndFor(pressedLate, "DAILY");
    const covered = ["2026-08-02", "2026-08-03", "2026-08-04"].filter((iso) =>
      overlapsDay({ start: pressedLate, end }, day(iso)),
    );

    expect(covered).toEqual(["2026-08-03"]);
  });

  it("gives each frequency its whole number of days", () => {
    const spans = {
      DAILY: 1,
      WEEKLY: 7,
      BIWEEKLY: 14,
      MONTHLY: 30,
    } as const;

    for (const [frequency, days] of Object.entries(spans)) {
      const end = periodEndFor(pressedLate, frequency as keyof typeof spans);
      const covered = Array.from({ length: 40 }, (_, i) =>
        toIsoDate(new Date(startOfUtcDay(pressedLate).getTime() + i * 86_400_000)),
      ).filter((iso) => overlapsDay({ start: pressedLate, end }, day(iso)));

      expect(covered.length, frequency).toBe(days);
    }
  });

  it("names the last day of a turn, not the midnight after it", () => {
    // An exclusive end means the instant itself belongs to the next date.
    expect(toIsoDate(lastCoveredDay("2026-08-04T00:00:00.000Z"))).toBe("2026-08-03");
  });

  it("keeps projected turns on the same day boundaries", () => {
    // Otherwise the straddle returns the moment the view looks past the
    // current turn.
    const end = periodEndFor(pressedLate, "DAILY");
    const next = projectPeriod(end, "DAILY", day("2026-08-09"))!;

    expect(next.start.toISOString()).toBe("2026-08-09T00:00:00.000Z");
    expect(next.end.toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });
});
