import { describe, expect, it } from "vitest";
import type { Rejection } from "@/lib/engine";
import { decimal3, shortfallText, signed3, unitNoun } from "./format";
import { nearestMiss, nearestMissText, orderByShortfall } from "./near-miss";

const reject = (patch: Partial<Rejection> & Pick<Rejection, "code">): Rejection => ({
  sentence: "s",
  shortfall: null,
  unit: "none",
  blocking: true,
  causedBy: "curated",
  causedByConfidence: "verified",
  ...patch,
});

describe("decimal3", () => {
  it("rounds float noise to three places and refuses to print a non-finite value", () => {
    expect(decimal3(0.1 + 0.2)).toBe("0.300");
    expect(decimal3(1 / 3)).toBe("0.333");
    expect(decimal3(-2.5)).toBe("-2.500");
    expect(decimal3(0)).toBe("0.000");
    expect(decimal3(Number.NaN)).toBe("0.000");
    expect(decimal3(Number.POSITIVE_INFINITY)).toBe("0.000");
  });
});

describe("signed3", () => {
  it("spells the sign out so a penalty cannot read as a gain", () => {
    expect(signed3(0.4)).toBe("+0.400");
    expect(signed3(-0.4)).toBe("-0.400");
    expect(signed3(0)).toBe("0.000");
    expect(signed3(Number.NaN)).toBe("0.000");
  });
});

describe("unitNoun", () => {
  it("pluralises the singular-only engine token", () => {
    expect(unitNoun("minutes", 1)).toBe("minute");
    expect(unitNoun("minutes", 2)).toBe("minutes");
    expect(unitNoun("seats", 1)).toBe("seat");
    expect(unitNoun("seats", 3)).toBe("seats");
    expect(unitNoun("days", 1)).toBe("day");
  });

  it("passes the already-invariant and empty units through", () => {
    expect(unitNoun("inr", 1)).toBe("rupees");
    expect(unitNoun("inr", 400)).toBe("rupees");
    expect(unitNoun("km", 1)).toBe("km");
    expect(unitNoun("none", 1)).toBe("");
  });
});

describe("shortfallText", () => {
  it("prints the magnitude in the unit the code declares, pluralised", () => {
    expect(shortfallText(reject({ code: "duration_exceeds_budget", shortfall: 15, unit: "minutes" }))).toBe("15 minutes short");
    expect(shortfallText(reject({ code: "duration_exceeds_budget", shortfall: 1, unit: "minutes" }))).toBe("1 minute short");
    expect(shortfallText(reject({ code: "over_budget", shortfall: 400, unit: "inr" }))).toBe("400 rupees short");
  });

  it("prints nothing rather than inventing a number", () => {
    expect(shortfallText(reject({ code: "sold_out" }))).toBeNull();
    expect(shortfallText(reject({ code: "sold_out", unit: "minutes" }))).toBeNull();
    expect(shortfallText(reject({ code: "sold_out", shortfall: Number.NaN, unit: "minutes" }))).toBeNull();
  });
});

describe("orderByShortfall", () => {
  it("orders by shortfall inside one unit and groups the units in a declared order", () => {
    const ordered = orderByShortfall([
      reject({ code: "over_budget", shortfall: 400, unit: "inr" }),
      reject({ code: "too_far", shortfall: 90, unit: "minutes" }),
      reject({ code: "duration_exceeds_budget", shortfall: 8, unit: "minutes" }),
      reject({ code: "capacity_exceeded", shortfall: 2, unit: "seats" }),
    ]);
    // Time first because time is the first limit a traveller reaches for, then
    // the budget, then the party size, and smallest to largest inside each. The
    // 2 seat gap never beats the 8 minute one, because a seat and a minute are
    // not the same size.
    expect(ordered.map((item) => item.code)).toEqual([
      "duration_exceeds_budget",
      "too_far",
      "over_budget",
      "capacity_exceeded",
    ]);
  });

  it("puts unmeasured reasons last", () => {
    const ordered = orderByShortfall([
      reject({ code: "sold_out" }),
      reject({ code: "too_far", shortfall: 90, unit: "minutes" }),
      reject({ code: "seasonal_mismatch" }),
    ]);
    expect(ordered.map((item) => item.code)).toEqual(["too_far", "seasonal_mismatch", "sold_out"]);
  });

  it("does not mutate the array it was handed", () => {
    const input = [
      reject({ code: "too_far", shortfall: 90, unit: "minutes" }),
      reject({ code: "duration_exceeds_budget", shortfall: 8, unit: "minutes" }),
    ];
    const snapshot = input.map((item) => item.code);
    orderByShortfall(input);
    expect(input.map((item) => item.code)).toEqual(snapshot);
  });

  it("breaks a tie on the code, so two equal gaps never swap between renders", () => {
    const a = reject({ code: "too_far", shortfall: 8, unit: "minutes" });
    const b = reject({ code: "duration_exceeds_budget", shortfall: 8, unit: "minutes" });
    expect(orderByShortfall([b, a]).map((item) => item.code)).toEqual([
      "duration_exceeds_budget",
      "too_far",
    ]);
    expect(orderByShortfall([a, b]).map((item) => item.code)).toEqual([
      "duration_exceeds_budget",
      "too_far",
    ]);
  });
});

describe("nearestMiss", () => {
  it("is the smallest measured gap in the leading unit", () => {
    const rejections = [
      reject({ code: "over_budget", shortfall: 400, unit: "inr" }),
      reject({ code: "too_far", shortfall: 90, unit: "minutes" }),
      reject({ code: "duration_exceeds_budget", shortfall: 8, unit: "minutes" }),
    ];
    expect(nearestMiss(rejections)?.code).toBe("duration_exceeds_budget");
  });

  it("is null when nothing was measured, so no near-miss is implied", () => {
    expect(nearestMiss([reject({ code: "sold_out" })])).toBeNull();
    expect(nearestMiss([reject({ code: "hours_unverified", blocking: false, shortfall: 3, unit: "minutes" })])).toBeNull();
    expect(nearestMiss([])).toBeNull();
  });

  it("skips a leading group that has no number, rather than reporting nothing", () => {
    expect(
      nearestMiss([
        reject({ code: "closed_now" }),
        reject({ code: "over_budget", shortfall: 400, unit: "inr" }),
      ])?.code,
    ).toBe("over_budget");
  });
});

describe("nearestMissText", () => {
  it("names the magnitude, the limit it belongs to, and what is left", () => {
    expect(
      nearestMissText([
        reject({ code: "duration_exceeds_budget", shortfall: 8, unit: "minutes" }),
        reject({ code: "too_far", shortfall: 90, unit: "minutes" }),
      ]),
    ).toBe(
      "Nearest miss: 8 minutes short, the smallest gap in the time limits. 1 other blocking reason on this record.",
    );
  });

  it("names the budget for money and never ranks rupees against minutes", () => {
    expect(
      nearestMissText([
        reject({ code: "over_budget", shortfall: 400, unit: "inr" }),
        reject({ code: "duration_exceeds_budget", shortfall: 8, unit: "minutes" }),
      ]),
    ).toBe(
      "Nearest miss: 8 minutes short, the smallest gap in the time limits. 1 other blocking reason on this record.",
    );
    expect(nearestMissText([reject({ code: "over_budget", shortfall: 400, unit: "inr" })])).toBe(
      "Nearest miss: 400 rupees short, the smallest gap in the budget. It is the only thing standing in the way.",
    );
  });

  it("stays silent when there is no magnitude to name", () => {
    expect(nearestMissText([reject({ code: "sold_out" })])).toBeNull();
  });
});
