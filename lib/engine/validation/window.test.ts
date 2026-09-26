import { describe, expect, it } from "vitest";
import {
  arrivalOffsetMinutes,
  checkConditions,
  checkDeadline,
  checkOpeningHours,
  checkOverlap,
  checkTimeBudget,
  checkWindows,
  clockLabel,
  consumedMinutes,
  dayOfWeek,
  minutesOfDay,
  minutesUntil,
} from "./window";
import type {
  DiscoveryContext,
  ExperienceV2,
  OpeningHours,
  Stop,
  Weights,
} from "@/lib/engine/contracts/types";

function rec(over: Partial<ExperienceV2> = {}): ExperienceV2 {
  return {
    id: "r",
    name: "Record",
    area: "Quarter",
    city: "Harbour City",
    zone: "Zone",
    station: "Station",
    category: "Culture",
    description: "",
    coordinates: [4, 52],
    travelMinutes: 10,
    durationMinutes: 60,
    priceInr: 0,
    pricePerPersonInr: null,
    capacity: null,
    openingHours: { weekly: allDay(), confidence: "verified" },
    availability: {
      leadTimeMinutes: 0,
      soldOutAt: null,
      remainingCapacity: null,
      bookingUrl: null,
      updatedAt: "2026-01-01T00:00:00Z",
    },
    access: {},
    diets: [],
    indoor: "indoor",
    kidFriendly: null,
    season: null,
    bestTimeOfDay: "any",
    ratingSum: null,
    reviewCount: null,
    authenticity: null,
    providerReliability: null,
    crowdProfile: null,
    provenance: {} as ExperienceV2["provenance"],
    confidence: {},
    sources: {},
    imageUrl: "",
    imageCredit: "",
    status: "",
    statusTone: "blue",
    updated: "",
    ...over,
  };
}

function allDay(): OpeningHours["weekly"] {
  const windows = [{ from: 0, to: 1440 }];
  return {
    0: windows,
    1: windows,
    2: windows,
    3: windows,
    4: windows,
    5: windows,
    6: windows,
  };
}

function ctx(over: Partial<DiscoveryContext> = {}): DiscoveryContext {
  return {
    now: "2026-01-01T09:00:00",
    origin: { coordinates: [4, 52], label: "Start", area: "Quarter" },
    availableMinutes: 480,
    deadline: null,
    budgetInr: 5000,
    partySize: 2,
    hasToddler: false,
    hasElderly: false,
    raining: false,
    weatherSeverity: null,
    travelMode: "walk",
    pace: "normal",
    idealStops: 3,
    minStops: 1,
    accessNeeds: [],
    diets: [],
    query: "",
    profile: {
      id: "t",
      interests: {},
      avoid: {},
      accessibility: [],
      diets: [],
      excludes: [],
      pins: [],
      weights: {} as Weights,
      bandit: { arms: [], observations: 0, updatedAt: "" },
    },
    city: {} as DiscoveryContext["city"],
    original: undefined as unknown as DiscoveryContext,
    ...over,
  };
}

const stop = (over: Partial<Stop> = {}): Stop => ({
  record: rec(),
  arriveBy: 540,
  travelMinutes: 10,
  travelKm: 1,
  visitMinutes: 60,
  bufferMinutes: 0,
  costInr: 0,
  ...over,
});

describe("minutesUntil", () => {
  it("returns a positive number for a deadline still ahead", () => {
    expect(minutesUntil("2026-01-01T10:00:00", "2026-01-01T13:30:00")).toBe(210);
  });

  it("returns a negative number for a deadline already past, rather than wrapping", () => {
    expect(minutesUntil("2026-01-01T13:30:00", "2026-01-01T10:00:00")).toBe(-210);
  });

  it("returns 0 for a deadline exactly now", () => {
    expect(minutesUntil("2026-01-01T10:00:00", "2026-01-01T10:00:00")).toBe(0);
  });

  it("counts across midnight for full timestamps", () => {
    expect(minutesUntil("2026-01-01T23:40:00", "2026-01-02T00:20:00")).toBe(40);
  });

  it("counts across midnight for a bare clock, taking the next occurrence", () => {
    expect(minutesUntil("23:40", "00:20")).toBe(40);
    expect(minutesUntil("00:10", "23:50")).toBe(1420);
  });

  it("returns 0 for an unparseable pair rather than NaN", () => {
    expect(Number.isNaN(minutesUntil("not a time", "also not"))).toBe(false);
    expect(minutesUntil("not a time", "also not")).toBe(0);
  });

  it("does not read the host clock, so a fake future stays in the future", () => {
    expect(minutesUntil("2099-01-01T00:00:00", "2099-01-01T00:10:00")).toBe(10);
  });
});

describe("clockLabel and minutesOfDay", () => {
  it("reads minutes from local midnight out of the ISO text", () => {
    expect(minutesOfDay("2026-01-01T09:05:00")).toBe(545);
    expect(minutesOfDay("2026-01-01T00:00:00")).toBe(0);
  });

  it("pads and wraps a minute count into HH:MM", () => {
    expect(clockLabel(0)).toBe("00:00");
    expect(clockLabel(545)).toBe("09:05");
    expect(clockLabel(1500)).toBe("01:00");
    expect(clockLabel(-60)).toBe("23:00");
  });
});

describe("dayOfWeek", () => {
  it("reads the weekday from the date, 0 being Sunday", () => {
    expect(dayOfWeek("2026-01-04T09:00:00")).toBe(0);
    expect(dayOfWeek("2026-01-05T09:00:00")).toBe(1);
    expect(dayOfWeek("2026-01-07T09:00:00")).toBe(3);
  });
});

describe("consumedMinutes and arrivalOffsetMinutes", () => {
  const plan = [
    stop({ travelMinutes: 10, visitMinutes: 60, bufferMinutes: 5 }),
    stop({ travelMinutes: 20, visitMinutes: 45, bufferMinutes: 5 }),
    stop({ travelMinutes: 15, visitMinutes: 30, bufferMinutes: 0 }),
  ];

  it("adds travel, visit and buffer in plan order", () => {
    expect(consumedMinutes(plan)).toBe(75 + 70 + 45);
  });

  it("is 0 for an empty plan", () => {
    expect(consumedMinutes([])).toBe(0);
  });

  it("measures the offset to each arrival, travel to the stop included", () => {
    expect(arrivalOffsetMinutes(plan, 0)).toBe(10);
    expect(arrivalOffsetMinutes(plan, 1)).toBe(95);
    expect(arrivalOffsetMinutes(plan, 2)).toBe(160);
  });
});

describe("checkWindows", () => {
  it("refuses an empty plan outright", () => {
    const issues = checkWindows([], ctx());
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("empty_plan");
  });

  it("passes a plan that fits and is open", () => {
    expect(checkWindows([stop()], ctx())).toEqual([]);
  });
});

describe("checkTimeBudget", () => {
  it("passes when the plan exactly fills the window, with no epsilon", () => {
    const plan = [stop({ travelMinutes: 20, visitMinutes: 60, bufferMinutes: 0 })];
    expect(consumedMinutes(plan)).toBe(80);
    expect(checkTimeBudget(plan, ctx({ availableMinutes: 80 }))).toEqual([]);
  });

  it("fails one minute over and names the shortfall", () => {
    const plan = [stop({ travelMinutes: 20, visitMinutes: 61, bufferMinutes: 0 })];
    const issues = checkTimeBudget(plan, ctx({ availableMinutes: 80 }));
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("window_overflow");
    expect(issues[0].sentence).toContain("81 min");
    expect(issues[0].sentence).toContain("1 min too many");
  });
});

describe("checkDeadline", () => {
  it("imposes nothing when there is no deadline", () => {
    expect(checkDeadline([stop()], ctx({ deadline: null }))).toEqual([]);
  });

  it("fails when the plan runs past the return time and names both numbers", () => {
    const c = ctx({ now: "2026-01-01T09:00:00", deadline: "2026-01-01T10:00:00" });
    const plan = [stop({ travelMinutes: 20, visitMinutes: 60, bufferMinutes: 0 })];
    const issues = checkDeadline(plan, c);
    expect(issues).toHaveLength(1);
    expect(issues[0].sentence).toContain("80 min");
    expect(issues[0].sentence).toContain("60 min");
    expect(issues[0].sentence).toContain("20 min too many");
  });

  it("fails when the deadline has already passed, and does not wrap to tomorrow", () => {
    const c = ctx({ now: "2026-01-01T10:00:00", deadline: "2026-01-01T09:00:00" });
    expect(checkDeadline([stop()], c)).toHaveLength(1);
  });
});

describe("checkOverlap", () => {
  it("passes a plan whose stops follow one another", () => {
    const plan = [
      stop({ arriveBy: 540, visitMinutes: 60, bufferMinutes: 10 }),
      stop({ arriveBy: 610, visitMinutes: 45, bufferMinutes: 0 }),
    ];
    expect(checkOverlap(plan)).toEqual([]);
  });

  it("fails when a stop starts before the previous one ends and names the overlap", () => {
    const plan = [
      stop({ arriveBy: 540, visitMinutes: 60, bufferMinutes: 10 }),
      stop({ arriveBy: 585, visitMinutes: 45, bufferMinutes: 0 }),
    ];
    const issues = checkOverlap(plan);
    expect(issues).toHaveLength(1);
    expect(issues[0].offendingId).toBe("r");
    expect(issues[0].sentence).toContain("25 min");
  });
});

describe("checkOpeningHours", () => {
  const c = ctx({ now: "2026-01-01T09:00:00" });

  it("passes a visit inside a listed window", () => {
    const r = rec({
      openingHours: { weekly: { ...allDay(), 4: [{ from: 600, to: 1080 }] }, confidence: "verified" },
    });
    // 2026-01-01 is a Thursday, index 4.
    expect(checkOpeningHours([stop({ record: r, arriveBy: 660, visitMinutes: 60 })], c)).toEqual([]);
  });

  it("fails a visit that starts before opening", () => {
    const r = rec({
      openingHours: { weekly: { 4: [{ from: 600, to: 1080 }] }, confidence: "verified" },
    });
    const issues = checkOpeningHours([stop({ record: r, arriveBy: 540, visitMinutes: 60 })], c);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("closed_during_window");
    expect(issues[0].sentence).toContain("10:00 to 18:00");
  });

  it("fails a visit that runs past closing", () => {
    const r = rec({
      openingHours: { weekly: { 4: [{ from: 600, to: 1080 }] }, confidence: "verified" },
    });
    const issues = checkOpeningHours([stop({ record: r, arriveBy: 1050, visitMinutes: 60 })], c);
    expect(issues).toHaveLength(1);
  });

  it("says a record is listed closed on a day with no windows", () => {
    const r = rec({
      openingHours: { weekly: { 1: [{ from: 600, to: 1080 }] }, confidence: "verified" },
    });
    const issues = checkOpeningHours([stop({ record: r })], c);
    expect(issues[0].sentence).toContain("closed on that day");
  });

  it("refuses unverified hours rather than guessing at them", () => {
    const r = rec({ openingHours: { weekly: allDay(), confidence: "unverified" } });
    const issues = checkOpeningHours([stop({ record: r })], c);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("hours_unverified");
    expect(issues[0].sentence).toContain("unverified");
  });

  it("matches a window whose closing time runs past midnight", () => {
    // `HoursWindow.to` is documented as allowed to exceed 1440 for exactly this.
    const r = rec({
      openingHours: {
        weekly: { 4: [{ from: 1320, to: 1560 }] },
        confidence: "verified",
      },
    });
    const plan = [stop({ record: r, arriveBy: 1400, visitMinutes: 120 })];
    expect(checkOpeningHours(plan, c)).toEqual([]);
  });

  it("fails a visit that is not wholly inside any single window", () => {
    // 22:00 to 24:00 plus 00:00 to 02:00 the next day is not one window, so a
    // 23:20 to 00:20 visit is inside neither and is refused.
    const r = rec({
      openingHours: {
        weekly: { 4: [{ from: 1320, to: 1440 }], 5: [{ from: 0, to: 120 }] },
        confidence: "verified",
      },
    });
    const plan = [stop({ record: r, arriveBy: 1400, visitMinutes: 120 })];
    expect(checkOpeningHours(plan, c)).toHaveLength(1);
  });
});

describe("checkConditions: weather", () => {
  const outdoor = () => stop({ record: rec({ indoor: "outdoor" }) });

  it("refuses an outdoor stop under a storm", () => {
    const issues = checkConditions([outdoor()], ctx({ weatherSeverity: "storm" }));
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("weather_unsafe");
    expect(issues[0].offendingId).toBe("r");
  });

  it("refuses an outdoor stop under heavy rain", () => {
    expect(checkConditions([outdoor()], ctx({ weatherSeverity: "heavy_rain" }))).toHaveLength(1);
  });

  it("allows an outdoor stop under plain rain", () => {
    expect(checkConditions([outdoor()], ctx({ weatherSeverity: "rain" }))).toEqual([]);
  });

  it("allows an outdoor stop when the weather is unknown, because unknown is not false", () => {
    expect(checkConditions([outdoor()], ctx({ weatherSeverity: null }))).toEqual([]);
  });

  it("allows an indoor stop under a storm", () => {
    expect(checkConditions([stop()], ctx({ weatherSeverity: "storm" }))).toEqual([]);
  });

  it("allows a mixed stop under a storm, because it is not wholly outdoors", () => {
    const mixed = stop({ record: rec({ indoor: "mixed" }) });
    expect(checkConditions([mixed], ctx({ weatherSeverity: "storm" }))).toEqual([]);
  });
});

describe("checkConditions: availability", () => {
  const soldOut = (at: string) =>
    rec({
      availability: {
        leadTimeMinutes: 0,
        soldOutAt: at,
        remainingCapacity: null,
        bookingUrl: null,
        updatedAt: "2026-01-01T08:00:00Z",
      },
    });

  it("refuses a stop the plan reaches after the sold-out instant", () => {
    const c = ctx({ now: "2026-01-01T09:00:00Z" });
    const issues = checkConditions(
      [stop({ record: soldOut("2026-01-01T09:30:00Z"), travelMinutes: 45 })],
      c,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("sold_out");
  });

  it("allows a stop the plan reaches before the sold-out instant", () => {
    const c = ctx({ now: "2026-01-01T09:00:00Z" });
    expect(
      checkConditions(
        [stop({ record: soldOut("2026-01-01T11:00:00Z"), travelMinutes: 45 })],
        c,
      ),
    ).toEqual([]);
  });

  it("ignores a null sold-out instant", () => {
    expect(checkConditions([stop()], ctx({ now: "2026-01-01T09:00:00Z" }))).toEqual([]);
  });
});
