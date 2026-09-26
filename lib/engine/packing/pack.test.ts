import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_BUFFER_MINUTES } from "@/lib/engine/feasibility";
import { localMinutesOfDay, objectiveFast } from "@/lib/engine/scoring";
import { parsePrice } from "@/lib/plan";
import { makeContext, makeGrid, makeOptions, makeRecords, makeRecord } from "./fixtures.test";
import { buildStops, pack, travelWindowMinutes, type PackOptions } from "./pack";

const ctx = makeContext();
const records = makeRecords();
const options = makeOptions(records, ctx);

describe("buildStops", () => {
  it("assigns arriveBy in strictly increasing order", () => {
    const stops = buildStops(["r00", "r01", "r04"], ctx, { ...options, records });
    expect(stops.map((stop) => stop.record.id)).toEqual(["r00", "r01", "r04"]);
    for (let i = 1; i < stops.length; i += 1) {
      expect(stops[i].arriveBy).toBeGreaterThan(stops[i - 1].arriveBy);
    }
    expect(stops[0].arriveBy).toBe(940 + options.originMinutes("r00").minutes);
  });

  it("consumes exactly the sum of travel, visit and buffer", () => {
    const order = ["r00", "r01", "r04", "r07"];
    const stops = buildStops(order, ctx, { ...options, records });
    const summed = stops.reduce((total, stop) => total + stop.travelMinutes + stop.visitMinutes + stop.bufferMinutes, 0);
    const last = stops[stops.length - 1];
    // The window a plan consumes, from stepping out of the door to walking out of
    // the last stop. This is the number the feasibility meter and the validation
    // window both read, so it is asserted from the clock, not from an index.
    expect(last.arriveBy + last.visitMinutes - localMinutesOfDay(ctx.now)).toBe(summed);
    // And every hop advances the clock by exactly that stop's visit plus its buffer
    // plus the leg to the next one, so no minute is invented or dropped.
    for (let i = 1; i < stops.length; i += 1) {
      expect(stops[i].arriveBy - stops[i - 1].arriveBy).toBe(
        stops[i - 1].visitMinutes + stops[i - 1].bufferMinutes + stops[i].travelMinutes,
      );
    }
    const visits = order.reduce((total, id) => total + records.find((record) => record.id === id)!.durationMinutes, 0);
    expect(summed).toBe(stops.reduce((total, stop) => total + stop.travelMinutes, 0) + visits + DEFAULT_BUFFER_MINUTES * 3);
    expect(travelWindowMinutes(order, ctx, { ...options, records })).toBe(stops.reduce((total, stop) => total + stop.travelMinutes, 0));
  });

  it("buffers every stop but the last, because only the last has no onward leg", () => {
    const stops = buildStops(["r00", "r01", "r04"], ctx, { ...options, records });
    expect(stops.map((stop) => stop.bufferMinutes)).toEqual([DEFAULT_BUFFER_MINUTES, DEFAULT_BUFFER_MINUTES, 0]);
  });

  it("reads every minute and kilometre from the injected matrix", () => {
    const stops = buildStops(["r00", "r04"], ctx, { ...options, records });
    expect(stops[0].travelMinutes).toBe(options.originMinutes("r00").minutes);
    expect(stops[0].travelKm).toBe(options.originMinutes("r00").km);
    expect(stops[1].travelMinutes).toBe(options.matrix("r00", "r04").minutes);
    expect(stops[1].travelKm).toBe(options.matrix("r00", "r04").km);
  });

  it("keeps the total travel minutes equal to the injected tour legs", () => {
    const order = ["r00", "r01", "r04", "r07"];
    const stops = buildStops(order, ctx, { ...options, records });
    expect(stops.reduce((sum, stop) => sum + stop.travelMinutes, 0)).toBe(travelWindowMinutes(order, ctx, { ...options, records }));
  });

  it("multiplies a per person price by the party size, where the v1 parse did not", () => {
    // "From 300 per person" parsed to 300 under the old plan.ts, which then added
    // it once for the whole party. A party of four was billed for one head.
    const priceString = "From 300 per person";
    expect(parsePrice(priceString)).toBe(300);
    const record = makeRecord(0, [72.83, 19.05], { priceInr: 300, pricePerPersonInr: 300 });
    const stops = buildStops(["r00"], makeContext({ partySize: 4 }), {
      ...options,
      records: [record],
    });
    expect(stops[0].costInr).toBe(1200);
  });

  it("falls back to the headline price when there is no per person price", () => {
    const record = makeRecord(0, [72.83, 19.05], { priceInr: 450, pricePerPersonInr: null });
    const stops = buildStops(["r00"], makeContext({ partySize: 3 }), { ...options, records: [record] });
    expect(stops[0].costInr).toBe(1350);
  });

  it("is empty for an empty order and refuses an unknown id", () => {
    expect(buildStops([], ctx, { ...options, records })).toEqual([]);
    expect(() => buildStops(["nope"], ctx, { ...options, records })).toThrow('buildStops: no record supplied for id "nope"');
  });
});

describe("pack", () => {
  const result = pack(records, ctx, options);

  it("claims the strict rung and says nothing was relaxed", () => {
    expect(result.rung).toBe("strict");
    expect(result.relaxationNote).toMatch(/^Nothing was relaxed\./);
    expect(result.relaxationNote).not.toMatch(/relaxed: (?!nothing)/i);
    expect(result.relaxationNote).toContain(`${result.stops.length} stop`);
  });

  it("reports non zero search stats so the debug view is not all zeros", () => {
    // A tight grid of 16 candidates with room for 4 stops. The cluster peel and the
    // beam cannot nail the optimum here, so LAHC genuinely finds better plans and
    // the count of accepted improvements is real work rather than a decoration.
    const pool = makeGrid(16, 0.03);
    const searchCtx = makeContext({ idealStops: 4, minStops: 2, availableMinutes: 600 });
    const improvements = [1, 7, 1026, 4242, 31337, 55].map(
      (seed) => pack(pool, searchCtx, makeOptions(pool, searchCtx, { seed })).searchStats,
    );
    for (const stats of improvements) {
      expect(stats.candidates).toBe(16);
      expect(stats.evaluated).toBeGreaterThan(100);
      expect(stats.acceptedImprovements).toBeGreaterThan(0);
    }
    // And the same instance reports the same numbers twice.
    expect(pack(pool, searchCtx, makeOptions(pool, searchCtx, { seed: 1026 })).searchStats).toEqual(
      improvements[2],
    );
  });

  it("reports zero improvements when the construction is already optimal, which is information", () => {
    // The default fixture splits into three separate quarters, so the routed tour
    // that reaches the packer is already a local optimum of the whole neighbourhood.
    // Nothing to improve is a true statement about the search, not a broken counter,
    // and the debug view showing a zero is the honest reading.
    const result = pack(records, ctx, options);
    expect(result.searchStats.evaluated).toBeGreaterThan(100);
    expect(result.searchStats.acceptedImprovements).toBe(0);
  });

  it("fills the stop budget and never repeats a stop", () => {
    expect(result.stops).toHaveLength(ctx.idealStops);
    const ids = result.stops.map((stop) => stop.record.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the plan inside the traveller's window and budget", () => {
    const minutes = result.stops.reduce((sum, stop) => sum + stop.travelMinutes + stop.visitMinutes + stop.bufferMinutes, 0);
    expect(minutes).toBeLessThanOrEqual(ctx.availableMinutes);
    expect(result.stops.reduce((sum, stop) => sum + stop.costInr, 0)).toBeLessThanOrEqual(ctx.budgetInr);
  });

  it("reports the clusters it chose, each within the diameter bound", () => {
    expect(result.clusters.length).toBeGreaterThan(0);
    expect(result.clusters.length).toBeLessThanOrEqual(4);
    for (const cluster of result.clusters) {
      expect(cluster.ids.length).toBeGreaterThan(0);
      expect(cluster.diameterKm).toBeLessThanOrEqual(4);
    }
  });

  it("returns the objective the scorer derives from the same stops", () => {
    expect(result.objective).toEqual(objectiveFast(result.stops, ctx));
  });

  it("two calls with the same seed return a deep equal result", () => {
    expect(pack(records, ctx, options)).toEqual(result);
    expect(pack(records, ctx, { ...options, seed: 4242 })).toEqual(pack(records, ctx, { ...options, seed: 4242 }));
  });

  it("a different seed is still a valid plan", () => {
    const other = pack(records, ctx, { ...options, seed: 31337 });
    expect(other.stops).toHaveLength(ctx.idealStops);
    expect(other.rung).toBe("strict");
  });

  it("is deterministic across candidate ordering of the same set", () => {
    const reversed = pack([...records].reverse(), ctx, options);
    const forwardIds = result.stops.map((stop) => stop.record.id).sort();
    const reversedIds = reversed.stops.map((stop) => stop.record.id).sort();
    expect(reversedIds).toEqual(forwardIds);
  });

  it("always includes an explicitly pinned stop", () => {
    const pinned = pack(records, makeContext({ profile: { ...ctx.profile, pins: ["r09"] } }), options);
    expect(pinned.stops.map((stop) => stop.record.id)).toContain("r09");
  });

  it("respects a larger stop budget than clusters", () => {
    const roomy = pack(records, makeContext({ idealStops: 4, availableMinutes: 600 }), options);
    expect(roomy.stops.length).toBeGreaterThanOrEqual(3);
    expect(roomy.stops.length).toBeLessThanOrEqual(4);
  });

  it("returns an honest empty plan when given nothing", () => {
    const empty = pack([], ctx, { ...options, records: [] });
    expect(empty.stops).toEqual([]);
    expect(empty.rung).toBe("strict");
    expect(empty.relaxationNote).toContain("plan is empty");
    expect(empty.searchStats.candidates).toBe(0);
  });

  it("deduplicates repeated ids in the candidate list", () => {
    const doubled = pack([...records, ...records], ctx, options);
    expect(doubled.searchStats.candidates).toBe(records.length);
  });
});

describe("pack quality against brute force", () => {
  /** Every order of `size` distinct ids. 7 taken 3 at a time is 210 orders. */
  function allOrders(pool: string[], size: number): string[][] {
    const out: string[][] = [];
    const walk = (prefix: string[], rest: string[]) => {
      if (prefix.length === size) {
        out.push([...prefix]);
        return;
      }
      for (let i = 0; i < rest.length; i += 1) {
        walk([...prefix, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]);
      }
    };
    walk([], pool);
    return out;
  }

  it("lands within 3 percent of the exact optimum on a small instance", () => {
    const small = makeRecords().slice(0, 7);
    const smallCtx = makeContext({ idealStops: 3, minStops: 2 });
    const smallOptions = makeOptions(small, smallCtx);
    const got = pack(small, smallCtx, smallOptions);
    let best = -Infinity;
    for (const order of allOrders(small.map((record) => record.id), 3)) {
      const value = objectiveFast(buildStops(order, smallCtx, smallOptions), smallCtx).value;
      if (value > best) best = value;
    }
    expect(got.objective.value).toBeLessThanOrEqual(best + 1e-9);
    const gap = (best - got.objective.value) / Math.max(1e-9, Math.abs(best));
    expect(gap).toBeLessThanOrEqual(0.03);
  });

  it("finishes a 25 candidate pool well inside a frame", () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      makeRecord(index, [72.8 + (index % 5) * 0.04, 18.95 + Math.floor(index / 5) * 0.06]),
    );
    const started = process.hrtime.bigint();
    const wide = pack(many, makeContext(), makeOptions(many, makeContext()));
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    expect(elapsedMs).toBeLessThan(300);
    expect(wide.stops.length).toBeGreaterThan(0);
  });
});


describe("packing house style", () => {
  /** This file quotes every banned string as data, so it cannot scan itself. */
  const SELF = "pack.test.ts";
  const files = readdirSync(__dirname).filter((name) => name.endsWith(".ts") && name !== SELF);
  const code = (text: string) =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
      .replace(/\/\/[^\n]*/g, (line) => line.replace(/[^\n]/g, " "));
  const sources = files.map((name) => ({ name, text: readFileSync(path.join(__dirname, name), "utf8") }));

  it("has no em dash and no emoji anywhere in the stage", () => {
    for (const { name, text } of sources) {
      expect(text, name).not.toMatch(/\u2014/);
      expect(text, name).not.toMatch(
        /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u,
      );
    }
  });

  it("names no city, so the portability scan stays clean", () => {
    // Scans the source files only. A test may legitimately name a city in order to
    // assert its absence, and the guard that reads the whole tree owns that check.
    const production = sources.filter((entry) => !entry.name.endsWith(".test.ts"));
    for (const { name, text } of production) {
      expect(code(text), name).not.toMatch(/mumbai|delhi|bangalore|bengaluru|chennai|kolkata|hyderabad|pune/i);
    }
  });

  it("reads no clock and no randomness outside the seeded generator", () => {
    for (const { name, text } of sources) {
      expect(code(text), name).not.toMatch(/Date\s*\.\s*now|new\s+Date\(/);
      expect(code(text), name).not.toMatch(/Math\s*\.\s*random/);
      expect(code(text), name).not.toMatch(/\bfetch\s*\(/);
    }
  });

  it("keeps every rng behind the seeded generator in the source files", () => {
    const production = sources.filter((entry) => !entry.name.endsWith(".test.ts") && entry.name !== "lahc.ts");
    for (const { name, text } of production) expect(code(text), name).not.toMatch(/16807|2147483647/);
  });

  it("does not reach into a later numbered stage", () => {
    for (const { name, text } of sources) {
      expect(text, name).not.toMatch(/@\/lib\/engine\/(validation|replan|eval|retrieve|feasibility\/)/);
    }
  });

  it("exports the frozen signatures the barrel is wired to", () => {
    const barrel = readFileSync(path.join(__dirname, "index.ts"), "utf8");
    for (const sibling of ["beam", "cliques", "distance", "graph", "insertion", "lahc", "or-opt", "pack", "penalty", "two-opt"]) {
      expect(barrel).toContain(`./${sibling}`);
    }
    const packSource = readFileSync(path.join(__dirname, "pack.ts"), "utf8");
    expect(packSource).toMatch(/export function pack\(candidates: ExperienceV2\[\], ctx: DiscoveryContext, options: PackOptions\)/);
    expect(packSource).toMatch(/export function buildStops\(order: string\[\], ctx: DiscoveryContext, options: PackOptions\)/);
    expect(packSource).toMatch(/export interface PackOptions/);
  });

  it("imports the shared buffer constant rather than declaring its own", () => {
    const packSource = readFileSync(path.join(__dirname, "pack.ts"), "utf8");
    expect(packSource).toMatch(/import \{ DEFAULT_BUFFER_MINUTES \} from "@\/lib\/engine\/feasibility"/);
    expect(packSource).not.toMatch(/const DEFAULT_BUFFER_MINUTES/);
    expect(DEFAULT_BUFFER_MINUTES).toBe(15);
  });

  it("does not reimplement the objective or the clock reader locally", () => {
    const packSource = readFileSync(path.join(__dirname, "pack.ts"), "utf8");
    expect(packSource).toMatch(/objectiveFast[\s\S]{0,80}from "@\/lib\/engine\/scoring"/);
    expect(packSource).toMatch(/localMinutesOfDay/);
  });
});
