import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  BanditState,
  CityManifest,
  ExperienceV2,
  Plan,
  ProvenancedField,
  Provenance,
  Stop,
  Weights,
} from "@/lib/engine/contracts";
import { COMPONENT_IDS, PROVENANCE_VALUES } from "@/lib/engine/contracts";
import { localMinutesOfDay, objectiveFast } from "@/lib/engine/scoring";
import { objectiveNaive } from "@/lib/engine/validation";
import { buildContext } from "./context";
import type { ContextInput } from "./context";
import type { ReplanDeps } from "./minimality";

/** Every fixture instant is fixed. Nothing in this stage reads a clock. */
export const NOW = "2026-09-26T09:30:00.000Z";

const PROVENANCED_FIELDS: readonly ProvenancedField[] = [
  "name", "coordinates", "address", "category", "duration", "price",
  "capacity", "openingHours", "accessibility", "indoor", "kidFriendly",
  "booking", "seasonality", "bestTime", "diet", "rating", "reviewCount",
  "media", "pricePerPerson",
];

const provenance = (): Record<ProvenancedField, Provenance> =>
  PROVENANCED_FIELDS.reduce((acc, field) => {
    acc[field] = "curated";
    return acc;
  }, {} as Record<ProvenancedField, Provenance>);

const openEveryDay = (): ExperienceV2["openingHours"] => ({
  weekly: {
    0: [{ from: 0, to: 1440 }],
    1: [{ from: 0, to: 1440 }],
    2: [{ from: 0, to: 1440 }],
    3: [{ from: 0, to: 1440 }],
    4: [{ from: 0, to: 1440 }],
    5: [{ from: 0, to: 1440 }],
    6: [{ from: 0, to: 1440 }],
  },
  confidence: "verified",
  asOf: NOW,
});

/**
 * The weights the fixtures carry. Inlined rather than imported from session 4
 * so the exact value assertions in this stage do not move when the learned prior
 * is retuned.
 */
export const WEIGHTS: Weights = {
  interest: 1,
  rating: 1,
  value: 1,
  authenticity: 1,
  weather: 1,
  crowd: 1,
  novelty: 1,
  groupFit: 1,
  travelFriction: 1,
  reliability: 1,
  travelPenalty: 0.05,
  pacePenalty: 0.05,
};

const bandit = (): BanditState => ({
  arms: COMPONENT_IDS.map((component) => ({ component, alpha: 1, beta: 1, pulls: 0 })),
  observations: 0,
  updatedAt: NOW,
});

let sequence = 0;

/** Records handed out in creation order. Cleared by `resetRecords`. */
export const records: ExperienceV2[] = [];

/**
 * Clears the record list *and* the counter, so every test starts from the same
 * fixture state. Without the counter reset, the coordinates a test receives
 * depend on how many records earlier tests created, and any exact value
 * assertion downstream of an objective or a distance becomes order dependent.
 */
export const resetRecords = (): void => {
  records.length = 0;
  sequence = 0;
};

/** A fully populated record. The counter only shifts the coordinates. */
export const makeRecord = (patch: Partial<ExperienceV2> = {}): ExperienceV2 => {
  sequence += 1;
  const n = sequence;
  const record: ExperienceV2 = {
    id: `rec-${String(n).padStart(2, "0")}`,
    name: `Stop ${n}`,
    area: "North Quarter",
    city: "Sample City",
    zone: "North",
    station: "Central",
    category: "Gallery",
    description: `A fixture record number ${n}.`,
    // Inside the fixture bbox, or the gate answers `no_route` before it ever
    // looks at hours, and spread far enough apart that the proximity duplicate
    // check cannot pair two of them, whatever order the tests run in. The
    // modulo keeps a long test file inside the box however many records it
    // builds.
    coordinates: [72.74 + ((n * 7) % 20) * 0.01, 18.84 + ((n * 7) % 20) * 0.01],
    travelMinutes: 14,
    durationMinutes: 60,
    priceInr: 400,
    pricePerPersonInr: 200,
    capacity: 40,
    openingHours: openEveryDay(),
    availability: {
      leadTimeMinutes: 0,
      soldOutAt: null,
      remainingCapacity: null,
      bookingUrl: null,
      updatedAt: NOW,
    },
    access: {
      step_free: true,
      stroller_ok: true,
      accessible_restroom: true,
      seating_available: true,
      low_walking: true,
    },
    diets: ["vegetarian"],
    indoor: "indoor",
    kidFriendly: true,
    season: null,
    bestTimeOfDay: "any",
    ratingSum: 380,
    reviewCount: 80,
    authenticity: 0.8,
    providerReliability: 0.7,
    crowdProfile: 0.4,
    provenance: provenance(),
    confidence: { duration: "verified", price: "verified", openingHours: "verified" },
    sources: {},
    imageUrl: "",
    imageCredit: "",
    status: "Verified record",
    statusTone: "green",
    updated: "2026-09-01",
    ...patch,
  };
  records.push(record);
  return record;
};

/**
 * A record whose slot the provider has marked gone, at or before the context's
 * `now`, because the gate only calls a slot sold out once the instant has passed.
 */
export const soldOut = (): ExperienceV2["availability"] => ({
  leadTimeMinutes: 0,
  soldOutAt: "2026-09-26T09:00:00.000Z",
  remainingCapacity: 0,
  bookingUrl: null,
  updatedAt: NOW,
});
export const makeCity = (): CityManifest => ({
  id: "sample",
  displayName: "Sample City",
  currency: "INR",
  // UTC on purpose. Session 4's `localMinutesOfDay` reads the instant as it is
  // written, while session 3's `localClock` applies `ctx.city.timezone`, so any
  // other zone puts `arriveBy` and the gate's position on different minute
  // scales and every window check reads the wrong hour. Pinning the fixture to
  // UTC keeps this stage's tests off that argument.
  timezone: "UTC",
  bbox: [72.7, 18.8, 73.0, 19.1],
  neighbourhoods: [
    { name: "North Quarter", coordinates: [72.83, 18.93], station: "Central" },
    { name: "South Quarter", coordinates: [72.81, 18.91], station: "Harbour" },
  ],
  monsoonMonths: [6, 7, 8, 9],
  congestion: { walk: 1.2, auto: 1.8, taxi: 1.9, metro: 1.6, ferry: 1.4 },
  ferryCorridors: [],
  notes: "A fixture manifest with no city specific strings.",
});

export const makeContext = (patch: Partial<ContextInput> = {}) =>
  buildContext(
    {
      now: NOW,
      origin: { coordinates: [72.83, 18.93], label: "Central", area: "North Quarter" },
      availableMinutes: 240,
      deadline: null,
      budgetInr: 1000,
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
      query: "galleries and markets",
      profile: {
        id: "t-1",
        interests: { Gallery: 1, Market: 0.7 },
        avoid: {},
        accessibility: [],
        diets: [],
        excludes: [],
        pins: [],
        weights: { ...WEIGHTS },
        bandit: bandit(),
      },
      ...patch,
    } as ContextInput,
    makeCity(),
  );

/**
 * A deterministic lattice in place of a routing table. An id's position in `all`
 * sets its distance, so travel grows with plan order and a swap that ignores
 * position shows up in the minutes.
 */
export const makeDeps = (all: readonly ExperienceV2[], override: Partial<ReplanDeps> = {}): ReplanDeps => {
  const rank = new Map(all.map((record, at) => [record.id, at]));
  const rankOf = (id: string): number => rank.get(id) ?? 0;
  return {
    matrix: (aId, bId) => {
      const gap = Math.abs(rankOf(aId) - rankOf(bId));
      return { minutes: 4 + gap * 2, km: 0.2 + gap * 0.25 };
    },
    originMinutes: (id) => {
      const gap = rankOf(id);
      return { minutes: 6 + gap * 3, km: 0.3 + gap * 0.2 };
    },
    windowFor: (record) => {
      const gap = rankOf(record.id);
      return { startMin: 570 + gap * 5, endMin: 570 + gap * 5 + record.durationMinutes };
    },
    seed: 7,
    ...override,
  };
};

/** Minutes of slack every stop leaves for the next arrival. */
export const BUFFER_MINUTES = 10;

/** A plan over `ids`, with legs filled from the same lattice `makeDeps` uses. */
export const makePlan = (
  ctx: ReturnType<typeof makeContext>,
  all: readonly ExperienceV2[],
  ids: readonly string[],
): Plan => {
  const byId = new Map(all.map((record) => [record.id, record]));
  const deps = makeDeps(all);
  let clock = localMinutesOfDay(ctx.now);
  const stops = ids.map((id, position) => {
    const record = byId.get(id);
    if (!record) throw new Error(`no fixture record ${id}`);
    const leg = position === 0 ? deps.originMinutes(id) : deps.matrix(ids[position - 1], id);
    const arriveBy = clock + leg.minutes;
    clock = arriveBy + record.durationMinutes + BUFFER_MINUTES;
    return {
      record,
      arriveBy,
      travelMinutes: leg.minutes,
      travelKm: leg.km,
      visitMinutes: record.durationMinutes,
      bufferMinutes: BUFFER_MINUTES,
      costInr: record.priceInr,
    };
  });
  return { id: "plan-fixture", stops, objective: objectiveFast(stops, ctx), createdFrom: ctx };
};

/**
 * The independent objective check this stage leans on.
 *
 * Session 4's `objectiveFast` and session 6's `objectiveNaive` must agree to
 * 1e-6, and the frozen `Weights` type carries no `proximity` key even though the
 * objective spec writes `w.proximity` in the per-stop utility. Until the two
 * agree, `validate` rejects every plan, which would make this stage's
 * constraint assertions meaningless. `UPSTREAM_AGREES` is measured, not assumed,
 * and drives `describe.skipIf` in the constraint suites so a single loud test
 * names the upstream defect instead of a dozen confusing ones.
 */
export const driftProbe = (): { fast: number; naive: number; drift: number } => {
  const record: ExperienceV2 = {
    ...makeRecord({
      id: "drift-probe",
      priceInr: 400,
      coordinates: [72.8, 18.9],
    }),
  };
  const ctx = makeContext({ idealStops: 1, budgetInr: 10_000 });
  const stop: Stop = {
    record,
    arriveBy: 600,
    travelMinutes: 6,
    travelKm: 0.3,
    visitMinutes: 60,
    bufferMinutes: BUFFER_MINUTES,
    costInr: record.priceInr,
  };
  const fast = objectiveFast([stop], ctx).value;
  const naive = objectiveNaive([stop], ctx).value;
  return { fast, naive, drift: Math.abs(fast - naive) };
};

export const UPSTREAM_AGREES = driftProbe().drift <= 1e-6;

const dir = (): string => join(process.cwd(), "lib", "engine", "replan");

/** The forbidden city name, assembled at runtime so this file does not match itself. */
const FORBIDDEN_CITY = new RegExp(["mum", "bai"].join(""), "i");

/**
 * Emoji and pictographs, without a unicode regex flag, because the repository
 * targets es5 and a `u` flag is a compile error there.
 */
const hasPictographic = (text: string): boolean => {
  for (let at = 0; at < text.length; at += 1) {
    const code = text.codePointAt(at) as number;
    if (code > 0xffff) at += 1;
    if (code >= 0x1f000 || (code >= 0x2190 && code <= 0x2bff) || (code >= 0x1f000 && code <= 0x1faff)) {
      return true;
    }
  }
  return false;
};

describe("fixtures", () => {
  it("builds a record with provenance on every provenanced field", () => {
    resetRecords();
    const record = makeRecord({ id: "probe" });
    expect(Object.keys(record.provenance).sort()).toEqual([...PROVENANCED_FIELDS].sort());
    expect(PROVENANCED_FIELDS.length).toBe(19);
    for (const field of PROVENANCED_FIELDS) {
      expect(PROVENANCE_VALUES).toContain(record.provenance[field]);
    }
  });

  it("freezes the original and keeps the live context editable", () => {
    const ctx = makeContext();
    expect(Object.isFrozen(ctx.original)).toBe(true);
    expect(ctx.original).toBe(ctx.original.original);
    expect(ctx.profile.weights.interest).toBe(1);
  });

  it("has no em dash, no emoji, and no city name in this stage", () => {
    const files = readdirSync(dir()).filter((name) => name.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(5);
    for (const name of files) {
      const text = readFileSync(join(dir(), name), "utf8");
      expect({ name, emDash: text.includes("\u2014") }).toEqual({ name, emDash: false });
      expect({ name, emoji: hasPictographic(text) }).toEqual({ name, emoji: false });
      expect({ name, city: FORBIDDEN_CITY.test(text) }).toEqual({ name, city: false });
    }
  });
});
