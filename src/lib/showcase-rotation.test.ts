import { describe, expect, it } from "vitest";
import { pickShowcaseVehicleId, romeDayIndex, type ShowcaseCandidate } from "./showcase-rotation";

function vehicle(id: string, dealerId: string | null, hasCover = true): ShowcaseCandidate {
  return { id, dealerId, hasCover };
}

describe("romeDayIndex", () => {
  it("changes at midnight in Rome, not at midnight UTC", () => {
    // 23:30 UTC on 1 July is already 01:30 on 2 July in Rome (UTC+2).
    const lateUtc = new Date("2026-07-01T23:30:00Z");
    const earlyUtc = new Date("2026-07-02T00:30:00Z");

    expect(romeDayIndex(lateUtc)).toBe(romeDayIndex(earlyUtc));
  });

  it("advances by one per calendar day", () => {
    const first = romeDayIndex(new Date("2026-07-01T12:00:00Z"));
    const second = romeDayIndex(new Date("2026-07-02T12:00:00Z"));

    expect(second - first).toBe(1);
  });

  it("is stable across a single day", () => {
    const morning = romeDayIndex(new Date("2026-07-01T06:00:00Z"));
    const evening = romeDayIndex(new Date("2026-07-01T20:00:00Z"));

    expect(morning).toBe(evening);
  });
});

describe("pickShowcaseVehicleId", () => {
  it("returns nothing when no dealer is on Elite", () => {
    const picked = pickShowcaseVehicleId([vehicle("v1", "d1")], [], 0);
    expect(picked).toBeNull();
  });

  it("ignores vehicles of dealers that are not on Elite", () => {
    const picked = pickShowcaseVehicleId(
      [vehicle("v1", "d1"), vehicle("v2", "d2")],
      ["d2"],
      0,
    );

    expect(picked).toBe("v2");
  });

  it("ignores vehicles without a photo", () => {
    const picked = pickShowcaseVehicleId(
      [vehicle("v1", "d1", false), vehicle("v2", "d1", true)],
      ["d1"],
      0,
    );

    expect(picked).toBe("v2");
  });

  it("returns nothing when the only Elite vehicles have no photo", () => {
    const picked = pickShowcaseVehicleId([vehicle("v1", "d1", false)], ["d1"], 0);
    expect(picked).toBeNull();
  });

  it("gives every Elite dealer the same number of days", () => {
    const candidates = [vehicle("a", "d1"), vehicle("b", "d2"), vehicle("c", "d3")];
    const elite = ["d1", "d2", "d3"];

    const turns = new Map<string, number>();
    for (let day = 0; day < 300; day += 1) {
      const picked = pickShowcaseVehicleId(candidates, elite, day) as string;
      turns.set(picked, (turns.get(picked) ?? 0) + 1);
    }

    expect([...turns.values()]).toEqual([100, 100, 100]);
  });

  it("does not reward the dealer with the biggest stock", () => {
    // d1 has one vehicle, d2 has fifty. Rotating over the pooled list would
    // give d2 fifty times the exposure; rotating over dealers must not.
    const candidates = [
      vehicle("solo", "d1"),
      ...Array.from({ length: 50 }, (_, index) => vehicle(`big-${index}`, "d2")),
    ];

    let smallDealerDays = 0;
    for (let day = 0; day < 100; day += 1) {
      const picked = pickShowcaseVehicleId(candidates, ["d1", "d2"], day) as string;
      if (picked === "solo") {
        smallDealerDays += 1;
      }
    }

    expect(smallDealerDays).toBe(50);
  });

  it("shows a different car when the same dealer comes round again", () => {
    const candidates = [vehicle("x1", "d1"), vehicle("x2", "d1"), vehicle("y1", "d2")];
    const elite = ["d1", "d2"];

    const picksForD1 = [0, 2, 4, 6]
      .map((day) => pickShowcaseVehicleId(candidates, elite, day))
      .filter((id) => id !== "y1");

    expect(new Set(picksForD1).size).toBeGreaterThan(1);
  });

  it("does not depend on the order rows come back in", () => {
    const candidates = [vehicle("a", "d1"), vehicle("b", "d2"), vehicle("c", "d3")];
    const shuffled = [candidates[2], candidates[0], candidates[1]];

    for (let day = 0; day < 12; day += 1) {
      expect(pickShowcaseVehicleId(shuffled, ["d3", "d1", "d2"], day)).toBe(
        pickShowcaseVehicleId(candidates, ["d1", "d2", "d3"], day),
      );
    }
  });

  it("survives a negative day index", () => {
    const candidates = [vehicle("a", "d1"), vehicle("b", "d2")];
    const picked = pickShowcaseVehicleId(candidates, ["d1", "d2"], -7);

    expect(picked).not.toBeNull();
    expect(["a", "b"]).toContain(picked);
  });

  it("ignores candidates with no dealer", () => {
    const picked = pickShowcaseVehicleId([vehicle("orphan", null), vehicle("v", "d1")], ["d1"], 0);
    expect(picked).toBe("v");
  });
});
