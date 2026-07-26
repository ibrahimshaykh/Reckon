import { describe, it, expect } from "vitest";
import { haversineDistanceKm, pickFairestMeetingPoint } from "@/lib/fair-meeting-point";

describe("haversineDistanceKm", () => {
  it("matches the well-known ~111.2 km-per-degree-of-latitude reference", () => {
    const km = haversineDistanceKm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
    expect(km).toBeCloseTo(111.2, 0);
  });

  it("is zero for the same point", () => {
    expect(haversineDistanceKm({ latitude: 10, longitude: 20 }, { latitude: 10, longitude: 20 })).toBe(0);
  });
});

describe("pickFairestMeetingPoint", () => {
  it("picks the obviously closer option over a far one", () => {
    const result = pickFairestMeetingPoint(
      [
        { proposalId: "A", location: { latitude: 0, longitude: 1 } },
        { proposalId: "B", location: { latitude: 10, longitude: 10 } },
      ],
      [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 2 },
      ],
    );
    expect(result?.proposalId).toBe("A");
  });

  it("returns null when there are no options or no homes", () => {
    expect(pickFairestMeetingPoint([], [{ latitude: 0, longitude: 0 }])).toBeNull();
    expect(
      pickFairestMeetingPoint([{ proposalId: "A", location: { latitude: 0, longitude: 0 } }], []),
    ).toBeNull();
  });
});
