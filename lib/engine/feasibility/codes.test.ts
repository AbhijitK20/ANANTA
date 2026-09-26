import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { REJECTION_CODES, REJECTION_CODES_LIST } from "@/lib/engine/contracts";
import type { DiscoveryContext, ExperienceV2, RejectionCode, TravellerProfile } from "@/lib/engine/contracts";
import { gate, runChecks } from "./gate";
import type { GateOptions, GatePosition } from "./gate";
import { travelMinutesFor } from "./checks/time";
import { codes, makeContext, makePosition, makeRecord } from "./checks/fixtures";

/**
 * The proof that a rejection is a feature and not an error: one row per code in
 * the frozen union, each with the smallest record and context that produces
 * that failure. Walked against the union rather than a hand-typed list, so a
 * code added to contracts without a row here fails the build.
 */

interface Row {
  code: RejectionCode;
  record?: Partial<ExperienceV2>;
  ctx?: Partial<DiscoveryContext>;
  profile?: Partial<TravellerProfile>;
  /** Visit window start, minutes from local midnight on the test Saturday. */
  windowStart?: number;
  /** Month of the window, so a season case never depends on the clock. */
  month?: number;
  planned?: GatePosition["planned"];
}

const WEEKDAY = 6;
const JULY = 7;
const DEFAULT_WINDOW = 590;
const LOCAL_NOON_OFFSET = 570;

const ROWS: readonly Row[] = [
  { code: "too_far", record: { travelMinutes: 300 } },
  { code: "travel_time_exceeds_budget", record: { travelMinutes: 230, durationMinutes: 10 } },
  { code: "duration_exceeds_budget", record: { travelMinutes: 10, durationMinutes: 230 } },
  { code: "closed_now", record: { openingHours: { weekly: {}, confidence: "verified" } } },
  { code: "closed_during_window", record: { durationMinutes: 120 }, windowStart: 1200 },
  { code: "hours_unverified", record: { openingHours: { weekly: { 6: [{ from: 540, to: 1260 }] }, confidence: "unverified" } } },
  { code: "over_budget", ctx: { budgetInr: 500 } },
  { code: "over_budget_per_person", record: { pricePerPersonInr: 1500 }, ctx: { budgetInr: 1000 } },
  { code: "capacity_exceeded", record: { capacity: 1 }, ctx: { partySize: 4 } },
  { code: "unverified_required_fact", record: { capacity: null } },
  { code: "not_step_free", record: { access: { step_free: false } }, ctx: { accessNeeds: ["step_free"] } },
  { code: "not_stroller_ok", record: { access: { stroller_ok: false } }, ctx: { accessNeeds: ["stroller_ok"] } },
  { code: "no_accessible_restroom", record: { access: { accessible_restroom: false } }, ctx: { accessNeeds: ["accessible_restroom"] } },
  { code: "requires_steps", record: { access: { low_walking: false } }, ctx: { accessNeeds: ["low_walking"] } },
  { code: "no_seating", record: { access: { seating_available: false } }, ctx: { accessNeeds: ["seating_available"] } },
  { code: "not_quiet_enough", record: { access: { quiet_space: false } }, ctx: { accessNeeds: ["quiet_space"] } },
  { code: "diet_mismatch", record: { diets: ["vegetarian"] }, ctx: { diets: ["vegan"] } },
  { code: "sold_out", record: { availability: { leadTimeMinutes: 0, soldOutAt: "2026-07-04T09:40:00.000Z", remainingCapacity: null, bookingUrl: null, updatedAt: "2026-07-04T09:30:00.000Z" } } },
  { code: "requires_booking_not_available", record: { availability: { leadTimeMinutes: 1440, soldOutAt: null, remainingCapacity: null, bookingUrl: null, updatedAt: "2026-07-04T09:30:00.000Z" } } },
  { code: "lead_time_too_short", record: { availability: { leadTimeMinutes: 1440, soldOutAt: null, remainingCapacity: null, bookingUrl: "https://book.testcity.test/slot", updatedAt: "2026-07-04T09:30:00.000Z" } } },
  { code: "weather_unsafe", record: { indoor: "outdoor" }, ctx: { weatherSeverity: "heavy_rain" } },
  { code: "duplicate", planned: [{ id: "other", coordinates: [10.004, 20] }] },
  { code: "already_planned", profile: { pins: ["record-1"] } },
  { code: "excluded_by_traveller", profile: { excludes: ["record-1"] } },
  { code: "seasonal_mismatch", record: { season: { months: [11, 12, 1, 2], note: "Migratory season, November to February." } } },
  { code: "no_route", record: { coordinates: [50, 50] } },
];

function resolveRow(row: Row) {
  const ctx = makeContext(row.ctx);
  if (row.profile) ctx.profile = { ...ctx.profile, ...row.profile };
  const record = makeRecord(row.record);
  const startMin = row.windowStart ?? DEFAULT_WINDOW;
  const endMin = startMin + record.durationMinutes;
  const position = makePosition({
    travelMinutes: travelMinutesFor(record, ctx),
    startOffsetMin: startMin - LOCAL_NOON_OFFSET,
    window: { startMin, endMin },
    weekday: WEEKDAY,
    month: row.month ?? JULY,
    planned: row.planned ?? [],
  });
  const options: GateOptions = { windowFor: () => ({ startMin, endMin }), plannedStops: row.planned };
  return { ctx, record, position, options };
}

describe("every rejection code is reachable", () => {
  it("has a row for every code in the frozen union, with no row invented", () => {
    const covered = ROWS.map((row) => row.code);
    expect(covered.filter((code, i) => covered.indexOf(code) !== i)).toEqual([]);
    expect(REJECTION_CODES_LIST.filter((code) => !covered.includes(code))).toEqual([]);
  });

  for (const code of REJECTION_CODES_LIST) {
    it(code, () => {
      const row = ROWS.find((candidate) => candidate.code === code);
      if (!row) throw new Error(`no row produces ${code}`);
      const { ctx, record, position } = resolveRow(row);
      const produced = codes(runChecks(record, ctx, position));
      expect(produced, `expected ${code} in: ${produced.join(", ") || "no rejections"}`).toContain(code);
    });
  }

  it("keeps a record out of the pool if and only if something blocking fired", () => {
    for (const row of ROWS) {
      const { ctx, record, position, options } = resolveRow(row);
      const blocking = runChecks(record, ctx, position).some((rejection) => rejection.blocking);
      const result = gate([record], ctx, options);
      expect(result.passed.length, `${row.code}: blocking=${blocking}`).toBe(blocking ? 0 : 1);
      expect(result.rejected.length, row.code).toBe(blocking ? 1 : 0);
    }
  });
});

describe("the codes table itself", () => {
  it("is set equal to the union it mirrors", () => {
    expect(Object.keys(REJECTION_CODES).sort()).toEqual([...REJECTION_CODES_LIST].sort());
  });

  it("gives every code a sentence carrying a digit or a named fact", () => {
    const named = /open|clos|sold|book|notice|step|seating|quiet|noise|weather|rain|storm|season|month|party|people|budget|cost|price|capacity|route|travel|window|plan|excluded|hours|minute|restroom|required|unverified|diet|covered|stop/i;
    for (const code of REJECTION_CODES_LIST) {
      const sentence = REJECTION_CODES[code].sentence({});
      expect(sentence.length, code).toBeGreaterThan(0);
      expect(/\d/.test(sentence) || named.test(sentence), `${code}: ${sentence}`).toBe(true);
    }
  });

  it("renders a shortfall as a magnitude in the right unit", () => {
    expect(REJECTION_CODES.too_far.sentence({ shortfall: 85, unit: "minutes" })).toContain("85 min");
    expect(REJECTION_CODES.over_budget.sentence({ shortfall: 300, unit: "inr" })).toContain("300 rupees");
    expect(REJECTION_CODES.capacity_exceeded.sentence({ shortfall: 1, unit: "seats" })).toContain("1 seat");
    expect(REJECTION_CODES.capacity_exceeded.sentence({ shortfall: 1, unit: "seats" })).not.toContain("1 seats");
  });

  it("carries no em dash and no emoji in any sentence", () => {
    for (const code of REJECTION_CODES_LIST) {
      const sentence = REJECTION_CODES[code].sentence({ shortfall: 4, unit: "minutes", extra: "a fact" });
      expect(sentence, code).not.toContain("\u2014");
      expect(EMOJI.test(sentence), code).toBe(false);
    }
  });
});

/* ── source guards over this stage ─────────────────────────────────────────── */

/** Emoji and pictographs, matched without a unicode flag because tsconfig targets es5. */
const EMOJI = /[\u2600-\u27BF\uD800-\uDBFF\uFE0F]/;

const STAGE = resolve(process.cwd(), "lib/engine/feasibility");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

/** Test support sets `statusTone` because `ExperienceV2` requires the field. */
const EXEMPT = new Set(["checks/fixtures.ts"]);

function stageFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) stageFiles(full, out);
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const named = (file: string): string => relative(STAGE, file).split(sep).join("/");
const SOURCES = stageFiles(STAGE).filter((file) => !EXEMPT.has(named(file)));

function text(name: string): string {
  return readFileSync(join(STAGE, name), "utf8");
}

describe("this stage's source", () => {
  it("is not vacuously empty", () => {
    expect(SOURCES.length).toBeGreaterThan(10);
  });

  it("never writes a rejection sentence by hand", () => {
    for (const file of SOURCES) {
      const name = named(file);
      expect(/\bsentence\s*:\s*["'`]/.test(text(name)), name).toBe(false);
    }
  });

  it("never reads the legacy statusTone as a constraint", () => {
    for (const file of SOURCES) {
      const name = named(file);
      expect(text(name), name).not.toContain("statusTone");
    }
  });

  it("carries no em dash, no emoji and no city name", () => {
    for (const file of SOURCES) {
      const name = named(file);
      const source = text(name);
      expect(source, name).not.toContain("\u2014");
      expect(EMOJI.test(source), name).toBe(false);
      expect(/mumbai/i.test(source), name).toBe(false);
    }
  });

  it("reads no clock and no dice, so the gate is a pure function of the context", () => {
    for (const file of SOURCES) {
      const name = named(file);
      const source = text(name);
      expect(/\bDate\s*\.\s*now\b/.test(source), name).toBe(false);
      expect(/\bnew\s+Date\s*\(\s*\)/.test(source), name).toBe(false);
      expect(/\bMath\s*\.\s*random\b/.test(source), name).toBe(false);
      expect(/\bfetch\s*\(/.test(source), name).toBe(false);
    }
  });

  it("imports only from contracts and from its own stage", () => {
    for (const file of SOURCES) {
      const name = named(file);
      const specs = Array.from(text(name).matchAll(/from\s*["']([^"']+)["']/g)).map((m) => m[1]);
      for (const spec of specs) {
        const inward = spec.startsWith("@/lib/engine/contracts");
        const sameStage = spec.startsWith(".") && !spec.includes("engine/");
        expect(inward || sameStage, `${name} imports ${spec}`).toBe(true);
      }
    }
  });
});
