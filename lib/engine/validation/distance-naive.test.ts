import { describe, expect, it } from "vitest";
import { distanceFromOriginKm, haversineKm, legDistancesKm } from "./distance-naive";
import type { Stop } from "@/lib/engine/contracts/types";

const record = (id: string, lon: number, lat: number) =>
  ({ id, coordinates: [lon, lat] }) as unknown as Stop["record"];

const stop = (id: string, lon: number, lat: number) =>
  ({ record: record(id, lon, lat) }) as unknown as Stop;

describe("haversineKm", () => {
  it("returns 0 for a point against itself", () => {
    expect(haversineKm([72.83, 18.92], [72.83, 18.92])).toBe(0);
  });

  it("is symmetric", () => {
    const a: [number, number] = [4.9, 52.37];
    const b: [number, number] = [4.89, 52.36];
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 12);
  });

  it("matches the published great circle for a long haul, to the decimal", () => {
    // Heathrow to Haneda, 9591.31 km great circle on a mean-radius sphere.
    const d = haversineKm([-0.4536, 51.47], [140.3864, 35.7647]);
    expect(d).toBeCloseTo(9591.31, 1);
  });

  it("reads coordinates as lon then lat, not lat then lon", () => {
    // On a sphere of this radius one degree of arc is 111.1949 km either way,
    // so the two differ only away from the equator and only by the cosine.
    expect(haversineKm([0, 0], [1, 0])).toBeCloseTo(111.1949, 3);
    expect(haversineKm([0, 0], [0, 1])).toBeCloseTo(111.1949, 3);
    // A degree of longitude shrinks with the cosine of the latitude.
    expect(haversineKm([0, 60], [1, 60])).toBeCloseTo(55.5975, 3);
    expect(haversineKm([0, 60], [0, 61])).toBeCloseTo(111.1949, 3);
  });

  it("caps at half the circumference and never exceeds it", () => {
    const antipodal = haversineKm([0, 0], [180, 0]);
    expect(antipodal).toBeCloseTo(20015.11, 1);
    expect(antipodal).toBeLessThanOrEqual(Math.PI * 6371.0088);
  });

  it("clamps the arcsine argument so antipodes do not produce NaN", () => {
    expect(Number.isNaN(haversineKm([0, 0], [180, 0]))).toBe(false);
  });
});

describe("legDistancesKm", () => {
  const origin: [number, number] = [72.8, 19.0];

  it("measures the first leg from the origin and later legs from the previous stop", () => {
    const stops = [
      stop("a", 72.81, 19.0),
      stop("b", 72.82, 19.0),
      stop("c", 72.83, 19.0),
    ];
    const legs = legDistancesKm(stops, origin);
    expect(legs).toHaveLength(3);
    expect(legs[0]).toBeCloseTo(haversineKm(origin, [72.81, 19.0]), 12);
    expect(legs[1]).toBeCloseTo(haversineKm([72.81, 19.0], [72.82, 19.0]), 12);
    expect(legs[2]).toBeCloseTo(haversineKm([72.82, 19.0], [72.83, 19.0]), 12);
  });

  it("returns an empty array for an empty plan", () => {
    expect(legDistancesKm([], origin)).toEqual([]);
  });

  it("is order dependent, so callers must not reorder stops", () => {
    const forwards = legDistancesKm([stop("a", 72.81, 19.0), stop("b", 72.83, 19.0)], origin);
    const backwards = legDistancesKm([stop("b", 72.83, 19.0), stop("a", 72.81, 19.0)], origin);
    expect(forwards[0]).toBeLessThan(forwards[1]);
    expect(backwards[0]).toBeGreaterThan(backwards[1]);
  });
});

describe("distanceFromOriginKm", () => {
  it("agrees with haversineKm for the same pair", () => {
    const r = record("x", 72.87, 19.11);
    expect(distanceFromOriginKm(r, [72.83, 19.07])).toBe(
      haversineKm([72.83, 19.07], [72.87, 19.11]),
    );
  });
});
