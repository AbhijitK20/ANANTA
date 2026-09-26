import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeContext, makeOptions, makeRecords } from "./fixtures.test";
import {
  bboxDiagonalKm, buildDistanceMatrix, haversineKm, matrixDiameterKm, matrixKm, matrixLookup,
  projectMetres, referenceLatitude, tourCost, tourLegs,
} from "./distance";

/** Blanks comments, preserving line breaks, so a scan reads code and not prose. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (line) => line.replace(/[^\n]/g, " "));
}

describe("distance geometry", () => {
  it("projects a point at the reference latitude onto y = 0", () => {
    const [x, y] = projectMetres([72.87, 19.19], 19.19);
    expect(x).toBe(8111851.294105846);
    expect(y).toBe(0);
  });

  it("measures a known separation to the tenth of a kilometre", () => {
    expect(haversineKm([72.83, 19.05], [72.87, 19.19])).toBe(16.142607825204866);
    expect(haversineKm([72.83, 19.05], [72.83, 19.05])).toBe(0);
  });

  it("spans the manifest bbox corner to corner", () => {
    expect(bboxDiagonalKm([72.79, 18.9, 72.99, 19.28])).toBe(47.24476728554948);
  });

  it("reads the reference latitude off the manifest bbox", () => {
    expect(referenceLatitude(makeContext())).toBe(19.09);
  });
});

describe("buildDistanceMatrix", () => {
  const matrix = buildDistanceMatrix(makeRecords(), 19.09);

  it("is symmetric with a zero diagonal", () => {
    for (const id of matrix.ids) {
      expect(matrixKm(matrix, id, id)).toBe(0);
      for (const other of matrix.ids) {
        expect(matrixKm(matrix, id, other)).toBe(matrixKm(matrix, other, id));
      }
    }
  });

  it("runs long of the great-circle distance by roughly the Mercator stretch", () => {
    // Mercator is conformal, not equidistant: at 19 degrees north a projected
    // separation is about 1 / cos(19) = 1.0585 of the true one. The clustering
    // radius is calibrated against this table, so the factor is stated rather
    // than hidden, and it is only ever used to decide what counts as a cluster.
    const straight = haversineKm([72.83, 19.05], [72.87, 19.19]);
    const ratio = matrixKm(matrix, "r00", "r04") / straight;
    expect(ratio).toBeGreaterThan(1.05);
    expect(ratio).toBeLessThan(1.07);
    expect(matrixKm(matrix, "r00", "r04")).toBeCloseTo(straight * 1.0585, 2);
  });

  it("reports the widest pair as the diameter of a group", () => {
    expect(matrixDiameterKm(matrix, ["r00", "r01", "r02"])).toBe(0.5535488086524822);
    expect(matrixDiameterKm(matrix, ["r00", "r04", "r07"])).toBeCloseTo(29.046, 2);
    expect(matrixDiameterKm(matrix, [])).toBe(0);
    expect(matrixDiameterKm(matrix, ["r00"])).toBe(0);
  });

  it("refuses an id it was not built from", () => {
    expect(() => matrixKm(matrix, "r00", "nope")).toThrow('distance: id not in matrix, "nope"');
  });

  it("is deterministic and order stable", () => {
    expect(buildDistanceMatrix(makeRecords(), 19.09).metresSquared).toEqual(matrix.metresSquared);
    expect(matrixLookup(matrix)("r01", "r02")).toBe(matrixKm(matrix, "r01", "r02"));
  });
});

describe("tourCost", () => {
  const km = (a: string, b: string) => Number(a.slice(1)) * 10 + Number(b.slice(1));
  const origin = (id: string) => 100 + Number(id.slice(1));

  it("sums the legs and the leg out from the origin", () => {
    expect(tourCost(["r0", "r1", "r2"], km, origin)).toBe(100 + 1 + 12);
    expect(tourCost(["r0", "r1", "r2"], km)).toBe(13);
  });

  it("is zero for an empty order", () => {
    expect(tourCost([], km, origin)).toBe(0);
  });
});

describe("tourLegs", () => {
  const ctx = makeContext();
  const records = makeRecords();
  const options = makeOptions(records, ctx);

  it("reads every leg from the injected matrix and never from the record", () => {
    const legs = tourLegs(["r00", "r04"], ctx, options);
    expect(legs).toHaveLength(2);
    expect(legs[0].fromId).toBeNull();
    expect(legs[0].toId).toBe("r00");
    expect(legs[0].km).toBe(haversineKm(ctx.origin.coordinates, records[0].coordinates));
    expect(legs[1].fromId).toBe("r00");
    expect(legs[1].km).toBe(options.matrix("r00", "r04").km);
    expect(legs[0].mode).toBe("auto");
  });

  it("totals to the same number as the sum of the matrix legs", () => {
    const order = ["r00", "r01", "r04", "r07"];
    const total = tourLegs(order, ctx, options).reduce((sum, leg) => sum + leg.minutes, 0);
    const expected =
      options.originMinutes("r00").minutes +
      options.matrix("r00", "r01").minutes +
      options.matrix("r01", "r04").minutes +
      options.matrix("r04", "r07").minutes;
    expect(total).toBe(expected);
  });

  it("returns nothing for an empty order", () => {
    expect(tourLegs([], ctx, options)).toEqual([]);
  });
});

describe("distance.ts source hygiene", () => {
  const source = codeOnly(readFileSync(path.join(__dirname, "distance.ts"), "utf8"));

  it("contains no network call", () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bXMLHttpRequest\b/);
  });

  it("contains no clock read", () => {
    expect(source).not.toMatch(/Date\s*\.\s*now/);
    expect(source).not.toMatch(/new\s+Date/);
  });

  it("contains no randomness", () => {
    expect(source).not.toMatch(/Math\s*\.\s*random/);
  });

  it("names no city", () => {
    expect(source).not.toMatch(/mumbai|delhi|bangalore|chennai/i);
  });

  it("takes travel truth only from the injected matrix", () => {
    const calls = source.match(/options\.matrix\(|options\.originMinutes\(/g) ?? [];
    expect(calls).toHaveLength(2);
  });

  it("reuses the shared clock reader instead of parsing the timestamp twice", () => {
    expect(source).not.toMatch(/T\(\\d\{2\}/);
  });
});
