import { describe, expect, it } from "vitest";
import { instructionFor, positionAlongRoute, routeCacheKey, stepsFromLeg } from "@/lib/routing";
import { demoUserLocation } from "@/lib/location";
import { experienceSeed } from "@/lib/seed";

describe("instructionFor", () => {
  it("maps maneuvers to plain instructions", () => {
    expect(instructionFor({ type: "depart" })).toBe("Start");
    expect(instructionFor({ type: "turn", modifier: "left" })).toBe("Turn left");
    expect(instructionFor({ type: "turn", modifier: "right" })).toBe("Turn right");
    expect(instructionFor({ type: "turn", modifier: "slight left" })).toBe("Bear left");
    expect(instructionFor({ type: "fork", modifier: "right" })).toBe("Keep right");
    expect(instructionFor({ type: "roundabout" })).toBe("Take the roundabout");
    expect(instructionFor({ type: "arrive" })).toBe("Arrive at your destination");
    expect(instructionFor({ type: "continue" })).toBe("Continue");
  });
});

describe("stepsFromLeg", () => {
  const leg = {
    steps: [
      { maneuver: { type: "depart" }, name: "Marine Drive", distance: 40, duration: 30 },
      { maneuver: { type: "turn", modifier: "left" }, name: "A Road", distance: 300, duration: 200 },
      { maneuver: { type: "turn", modifier: "right" }, name: "Tiny Lane", distance: 20, duration: 15 },
      { maneuver: { type: "turn", modifier: "left" }, name: "B Road", distance: 800, duration: 500 },
      { maneuver: { type: "arrive" }, name: "", distance: 0, duration: 0 },
    ],
  };

  it("keeps every step when the route is short", () => {
    const steps = stepsFromLeg(leg);
    expect(steps).toHaveLength(5);
    expect(steps[0].instruction).toBe("Start");
    expect(steps[0].streetName).toBe("Marine Drive");
    expect(steps.at(-1)?.instruction).toBe("Arrive at your destination");
  });

  it("caps long routes to the longest moves in original order", () => {
    const long = {
      steps: [
        { maneuver: { type: "depart" }, name: "Start Street", distance: 30, duration: 20 },
        ...Array.from({ length: 28 }, (_, i) => ({
          maneuver: { type: "turn", modifier: "left" },
          name: `Street ${i}`,
          distance: i === 4 ? 2000 : 10 + i,
          duration: 60,
        })),
        { maneuver: { type: "arrive" }, name: "", distance: 0, duration: 0 },
      ],
    };
    const steps = stepsFromLeg(long);
    expect(steps.length).toBeLessThanOrEqual(14);
    expect(steps[0].instruction).toBe("Start");
    expect(steps.at(-1)?.instruction).toContain("Arrive");
    expect(steps.some((step) => step.distanceMeters === 2000)).toBe(true);
  });
});

describe("positionAlongRoute", () => {
  it("returns the endpoints at the extremes and the midpoint by distance", () => {
    const line: [number, number][] = [
      [0, 0],
      [0, 2],
      [0, 4],
    ];
    expect(positionAlongRoute(line, 0)).toEqual([0, 0]);
    expect(positionAlongRoute(line, 1)).toEqual([0, 4]);
    const mid = positionAlongRoute(line, 0.5);
    expect(mid[1]).toBeCloseTo(2, 5);
    expect(positionAlongRoute([], 0.5)).toEqual([0, 0]);
  });
});

describe("routeCacheKey", () => {
  it("is stable and rounded", () => {
    expect(routeCacheKey([72.823391, 18.93367], [72.8311, 18.9275])).toBe(
      routeCacheKey([72.82339, 18.933671], [72.8311, 18.92751]),
    );
  });
});

describe("demo location sits on the real seafront path", () => {
  it("uses coordinates on the Marine Drive promenade, not in the water", () => {
    // Snapped to the OSM walkway near the Churchgate end of Marine Drive.
    expect(demoUserLocation.coordinates).toEqual([72.82339, 18.93367]);
    expect(experienceSeed.length).toBeGreaterThan(30);
  });
});
