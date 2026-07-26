import { describe, it, expect } from "vitest";
import { assignChoresForPeriod } from "@/lib/chore-rotation";

describe("assignChoresForPeriod", () => {
  it("assigns the heaviest chore first, alternating as loads even out", () => {
    const result = assignChoresForPeriod(
      [
        { id: "heavy", effortWeight: 5 },
        { id: "medium", effortWeight: 3 },
        { id: "light", effortWeight: 1 },
      ],
      [
        { userId: "A", cumulativeEffort: 0 },
        { userId: "B", cumulativeEffort: 0 },
      ],
    );
    expect(result).toEqual({ heavy: "A", medium: "B", light: "B" });
  });

  it("gives a new chore to whoever is behind, regardless of chore weight", () => {
    const result = assignChoresForPeriod(
      [{ id: "chore", effortWeight: 2 }],
      [
        { userId: "A", cumulativeEffort: 10 },
        { userId: "B", cumulativeEffort: 0 },
      ],
    );
    expect(result).toEqual({ chore: "B" });
  });

  it("returns an empty assignment map when there are no members", () => {
    expect(assignChoresForPeriod([{ id: "chore", effortWeight: 1 }], [])).toEqual({});
  });
});
