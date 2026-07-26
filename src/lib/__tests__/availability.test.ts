import { describe, it, expect } from "vitest";
import { findGroupFreeTime } from "@/lib/availability";

describe("findGroupFreeTime", () => {
  it("finds the 3-way overlap across split windows", () => {
    // U1: [10-14], [16-18]; U2: [12-20]; U3: [13-15], [17-19]
    // U1 ∩ U2 = [12-14], [16-18]; that ∩ U3 = [13-14], [17-18]
    const result = findGroupFreeTime({
      U1: [
        { start: 10, end: 14 },
        { start: 16, end: 18 },
      ],
      U2: [{ start: 12, end: 20 }],
      U3: [
        { start: 13, end: 15 },
        { start: 17, end: 19 },
      ],
    });
    expect(result).toEqual([
      { start: 13, end: 14 },
      { start: 17, end: 18 },
    ]);
  });

  it("returns no windows when there's no overlap", () => {
    const result = findGroupFreeTime({
      U1: [{ start: 0, end: 5 }],
      U2: [{ start: 10, end: 15 }],
    });
    expect(result).toEqual([]);
  });

  it("merges a single user's overlapping windows", () => {
    const result = findGroupFreeTime({
      U1: [
        { start: 0, end: 5 },
        { start: 4, end: 8 },
      ],
    });
    expect(result).toEqual([{ start: 0, end: 8 }]);
  });

  it("returns no windows when nobody has responded", () => {
    expect(findGroupFreeTime({})).toEqual([]);
  });
});
