import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DiscoveryContext } from "@/lib/engine/contracts";
import { DEFAULT_BUFFER_MINUTES } from "@/lib/engine/feasibility";
import { localMinutesOfDay, objectiveFast } from "@/lib/engine/scoring";
import { parsePrice } from "@/lib/plan";
import { makeContext, makeGrid, makeOptions, makeRecords, makeRecord } from "./fixtures.test";
import { buildStops, pack, travelWindowMinutes, type PackOptions } from "./pack";

const ctx = makeContext();
const records = makeRecords();
const options = makeOptions(records, ctx);

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

/**
 * Whether an order fits both halves of the traveller's constraint pair. Read off
 * the same `buildStops` the packer builds from, which enforces neither the
 * window nor the budget, so every reference in this file filters on this.
 */
function fits(order: string[], context: DiscoveryContext, packOptions: PackOptions): boolean {
  const stops = buildStops(order, context, packOptions);
  const minutes = stops.reduce((sum, stop) => sum + stop.travelMinutes + stop.visitMinutes + stop.bufferMinutes, 0);
  const cost = stops.reduce((sum, stop) => sum + stop.costInr, 0);
  return minutes <= context.availableMinutes && cost <= context.budgetInr;
}

/** Best objective over the orders of `size` ids that actually fit. */
function bestFeasible(pool: string[], size: number, context: DiscoveryContext, packOptions: PackOptions): number {
  let best = Number.NEGATIVE_INFINITY;
  for (const order of allOrders(pool, size)) {
    if (!fits(order, context, packOptions)) continue;
    best = Math.max(best, objectiveFast(buildStops(order, context, packOptions), context).value);
  }
  return best;
}

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

  /** Minutes the plan consumes, the number the window is measured against. */
  const minutesOf = (packed: ReturnType<typeof pack>): number =>
    packed.stops.reduce((sum, stop) => sum + stop.travelMinutes + stop.visitMinutes + stop.bufferMinutes, 0);
  /** Rupees the plan costs, the number the budget is measured against. */
  const costOf = (packed: ReturnType<typeof pack>): number =>
    packed.stops.reduce((sum, stop) => sum + stop.costInr, 0);
  const idsOf = (packed: ReturnType<typeof pack>): string[] =>
    packed.stops.map((stop) => stop.record.id);
  const noRepeats = (packed: ReturnType<typeof pack>): boolean => {
    const ids = idsOf(packed);
    return new Set(ids).size === ids.length;
  };

  it("reports only the window and the budget it measured, and claims no hard check it never ran", () => {
    expect(result.rung).toBe("strict");
    // Every number in the note is read back out of the stops it describes, so a
    // traveller can add it up from the receipt and get the same figure.
    expect(result.relaxationNote).toContain(
      `${result.stops.length} stop${result.stops.length === 1 ? "" : "s"}`,
    );
    expect(result.relaxationNote).toContain(
      `${Math.round(minutesOf(result))} of your ${ctx.availableMinutes} minutes`,
    );
    expect(result.relaxationNote).toContain(`about ${Math.round(costOf(result))} of ${ctx.budgetInr}`);
    // The minutes the note reports are the plan's own minutes, and they are
    // inside the window the note names. That is the whole honest contract: the
    // search fits the plan itself, so there is usually no trim left to report,
    // and a note that claimed a trim had happened would be inventing it. The
    // fixture that does get trimmed asserts the clause, in the pin test below.
    expect(result.relaxationNote).not.toMatch(/dropped to fit/);
    expect(Math.round(minutesOf(result))).toBeLessThanOrEqual(ctx.availableMinutes);
    // The old note read "Nothing was relaxed. All hard constraints held for N
    // stops inside the M minute window". `pack` runs no hard check at all, so
    // that sentence asserted the output of a computation that does not exist in
    // this file. The replacement has to name the checker that does the work.
    expect(result.relaxationNote).not.toMatch(/^Nothing was relaxed\./);
    expect(result.relaxationNote).not.toMatch(/hard constraints held/i);
    expect(result.relaxationNote).toMatch(/Every hard constraint is checked separately/);
  });

  it("reports non zero search stats so the debug view is not all zeros", () => {
    // A tight grid of 16 candidates with room for 4 stops. The cluster peel and
    // the beam cannot nail the optimum here, so the instance is worth packing
    // several times over to show the counters are driven by real work.
    const pool = makeGrid(16, 0.03);
    const searchCtx = makeContext({ idealStops: 4, minStops: 2, availableMinutes: 600 });
    const improvements = [1, 7, 1026, 4242, 31337, 55].map(
      (seed) => pack(pool, searchCtx, makeOptions(pool, searchCtx, { seed })).searchStats,
    );
    for (const stats of improvements) {
      expect(stats.candidates).toBe(16);
      expect(stats.evaluated).toBeGreaterThan(100);
      // Not a specific count, and not a floor. The search is window aware now,
      // so on an instance it can solve it converges on the first plan and takes
      // nothing. The counter is worth asserting only as a bound: it cannot run
      // ahead of the evaluations that produced it.
      expect(stats.acceptedImprovements).toBeLessThanOrEqual(stats.evaluated);
    }
    // And the same instance reports the same numbers twice.
    expect(pack(pool, searchCtx, makeOptions(pool, searchCtx, { seed: 1026 })).searchStats).toEqual(
      improvements[2],
    );
  });

  it("bounds the accepted improvements by the evaluations that produced them", () => {
    // The invariant worth keeping is not the number but that the counter cannot
    // run ahead of the work, which is what makes it evidence of work rather than
    // a decoration. It reads 0 on this fixture, and nothing in the contract makes
    // a converged search report anything else, so no count is pinned here.
    expect(result.searchStats.candidates).toBe(records.length);
    expect(result.searchStats.evaluated).toBeGreaterThan(100);
    expect(result.searchStats.acceptedImprovements).toBeLessThanOrEqual(result.searchStats.evaluated);
  });

  it("never repeats a stop, and never returns more stops than the budget asked for", () => {
    // The window is inside the search now, so the plan the packer returns is one
    // that already fits and the stop budget is a cap rather than a hint. What it
    // must not do is repeat a stop or overshoot the count.
    expect(noRepeats(result)).toBe(true);
    expect(result.stops.length).toBeGreaterThan(0);
    expect(result.stops.length).toBeLessThanOrEqual(ctx.idealStops);
  });

  it("packs 3 stops on the default window, where a feasible 3 stop plan exists", () => {
    // The search optimises inside the window rather than over orders the window
    // cannot hold and then trimming the surplus off the tail. The old packer
    // chose 5 stops and 426 minutes for this 300 minute window and handed the
    // traveller 2 of them; the three stops of 214 minutes it returns now are the
    // plan the window asked for, and all three of them are kept.
    expect(ctx.idealStops).toBe(3);
    expect(result.stops).toHaveLength(3);
    expect(minutesOf(result)).toBeLessThanOrEqual(ctx.availableMinutes);
    expect(costOf(result)).toBeLessThanOrEqual(ctx.budgetInr);
    // Not vacuous. Every feasible 2 stop order of this fixture scores below the
    // 3 stop plan, so settling for 2 would be a real loss and not a wash.
    expect(result.objective.value).toBeGreaterThan(bestFeasible(records.map((record) => record.id), 2, ctx, options));
  });

  it("gives up the better scoring plan for one minute of overflow", () => {
    // The dominance test. The best of the 210 three stop orders of this slice
    // needs 217 minutes. It fits a 217 minute window exactly and misses a 216
    // minute one by a minute, and it scores higher than anything that does fit
    // the 216 minute window. So on the tighter window the search hands up the
    // better plan, which is what `1000 * overflowFraction` is for: a plan that
    // does not fit the traveller's afternoon is not a slightly worse plan.
    const pool = makeRecords().slice(0, 7);
    const insideCtx = makeContext({ idealStops: 3, minStops: 2, availableMinutes: 217, budgetInr: 20000 });
    const outsideCtx = makeContext({ idealStops: 3, minStops: 2, availableMinutes: 216, budgetInr: 20000 });
    const inside = pack(pool, insideCtx, makeOptions(pool, insideCtx));
    const outside = pack(pool, outsideCtx, makeOptions(pool, outsideCtx));
    // The plan given up is the better one, and it is out by minutes not rupees.
    expect(minutesOf(inside)).toBeGreaterThan(outsideCtx.availableMinutes);
    expect(minutesOf(inside)).toBeLessThanOrEqual(insideCtx.availableMinutes);
    // "Just outside", so the penalty has to be doing the work and not the margin.
    expect(minutesOf(inside) - outsideCtx.availableMinutes).toBeLessThanOrEqual(5);
    // The tighter window still returns a plan that fits, and it scores lower.
    expect(minutesOf(outside)).toBeLessThanOrEqual(outsideCtx.availableMinutes);
    expect(inside.objective.value).toBeGreaterThan(outside.objective.value);
  });

  it("keeps the plan inside the traveller's window and budget", () => {
    expect(minutesOf(result)).toBeLessThanOrEqual(ctx.availableMinutes);
    expect(costOf(result)).toBeLessThanOrEqual(ctx.budgetInr);
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
    // "Valid" is the window, the budget and no repeats, all read off the plan
    // rather than a stop count the window may not be able to hold.
    expect(other.rung).toBe("strict");
    expect(noRepeats(other)).toBe(true);
    expect(other.stops.length).toBeGreaterThan(0);
    expect(other.stops.length).toBeLessThanOrEqual(ctx.idealStops);
    expect(minutesOf(other)).toBeLessThanOrEqual(ctx.availableMinutes);
    expect(costOf(other)).toBeLessThanOrEqual(ctx.budgetInr);
    // The same instance, so the quality has to land in the same place too, not
    // merely be legal.
    expect(other.objective.value).toBeCloseTo(result.objective.value, 3);
  });

  it("is deterministic across candidate ordering of the same set", () => {
    const reversed = pack([...records].reverse(), ctx, options);
    expect(idsOf(reversed).sort()).toEqual(idsOf(result).sort());
  });

  it("keeps an explicitly pinned stop when the plan fits the window", () => {
    const pinned = pack(
      records,
      makeContext({ availableMinutes: 900, budgetInr: 20000, profile: { ...ctx.profile, pins: ["r09"] } }),
      options,
    );
    // No trim, so nothing is competing with the pin for room.
    expect(pinned.relaxationNote).not.toMatch(/dropped to fit/);
    expect(idsOf(pinned)).toContain("r09");
  });

  it("keeps an explicitly pinned stop when the window is too tight, and names what it dropped", () => {
    // The tightest fixture in this file, and the only one where `fitToWindow`
    // still has to cut: a 200 minute window and 1000 rupees cannot hold three
    // stops, so two are dropped to leave the pin. A pin is the one thing the
    // traveller said they must have, so it is cut last, and the note has to say
    // out loud what went instead of hiding it behind a sentence about relaxing.
    const tightCtx = makeContext({ availableMinutes: 200, budgetInr: 1000, profile: { ...ctx.profile, pins: ["r12"] } });
    const pinned = pack(records, tightCtx, options);
    expect(idsOf(pinned)).toContain("r12");
    expect(pinned.relaxationNote).toMatch(/\d+ later stops? (was|were) dropped to fit\./);
    // And what survives is still a plan that fits, which is the point of cutting
    // the unpinned stops rather than the pinned one.
    expect(minutesOf(pinned)).toBeLessThanOrEqual(tightCtx.availableMinutes);
    expect(costOf(pinned)).toBeLessThanOrEqual(tightCtx.budgetInr);
    expect(pinned.relaxationNote).not.toMatch(/still does not fit/);
  });

  it("keeps the plan inside a larger window when the stop budget exceeds the cluster count", () => {
    // Four stops were asked for. With the fixture's 2000 rupees the money is
    // what caps it, not the count and not the 600 minutes, so the assertion is
    // the window and the budget plus an honest account of the trim.
    const roomyCtx = makeContext({ idealStops: 4, availableMinutes: 600 });
    const roomy = pack(records, roomyCtx, options);
    expect(noRepeats(roomy)).toBe(true);
    expect(roomy.stops.length).toBeGreaterThan(0);
    expect(roomy.stops.length).toBeLessThanOrEqual(roomyCtx.idealStops);
    expect(minutesOf(roomy)).toBeLessThanOrEqual(roomyCtx.availableMinutes);
    expect(costOf(roomy)).toBeLessThanOrEqual(roomyCtx.budgetInr);
    // Four stops at 314 minutes fit 600, so there is nothing to trim. The note
    // claiming a trim here would be the old packer describing its own damage.
    expect(roomy.relaxationNote).not.toMatch(/dropped to fit/);
  });

  it("returns no more stops than the budget asked for, even when nothing binds", () => {
    // `ctx.idealStops` is a cap, not a hint, and it is applied to the beam's
    // winner. The beam used to leave with 7 stops for a budget of 4, and the
    // window trim hid that by cutting the surplus off again. pack.ts fixed this
    // with `capToBudget` on the beam's winner, so this asserts the guarantee
    // rather than the defect it used to be named for. The count itself is
    // deliberately not pinned: a better search filling the budget is the
    // contract, not a side effect worth freezing.
    const roomyCtx = makeContext({ idealStops: 4, availableMinutes: 600, budgetInr: 20000 });
    const roomy = pack(records, roomyCtx, options);
    expect(roomyCtx.idealStops).toBe(4);
    expect(roomy.stops.length).toBeLessThanOrEqual(roomyCtx.idealStops);
    expect(roomy.stops.length).toBeGreaterThan(0);
  });

  it("returns an honest empty plan when given nothing", () => {
    const empty = pack([], ctx, { ...options, records: [] });
    expect(empty.stops).toEqual([]);
    expect(empty.rung).toBe("strict");
    expect(empty.relaxationNote).toBe(
      "No stop fits inside the window and the budget, so there is no plan yet.",
    );
    expect(empty.searchStats.candidates).toBe(0);
  });

  it("deduplicates repeated ids in the candidate list", () => {
    const doubled = pack([...records, ...records], ctx, options);
    expect(doubled.searchStats.candidates).toBe(records.length);
  });
});

describe("pack quality against brute force", () => {
  it("closes the gap to the best order that fits, because the window is inside the search", () => {
    const small = makeRecords().slice(0, 7);
    const smallCtx = makeContext({ idealStops: 3, minStops: 2 });
    const smallOptions = makeOptions(small, smallCtx);
    const got = pack(small, smallCtx, smallOptions);
    // The reference has to be filtered, because `buildStops` enforces neither
    // the window nor the budget. The unfiltered maximum over all 210 orders is
    // a plan costing 2400 against a 2000 rupee budget, so comparing the packer
    // to it measures nothing but how infeasible the packer is being.
    let best = Number.NEGATIVE_INFINITY;
    let feasibleOrders = 0;
    for (const order of allOrders(small.map((record) => record.id), 3)) {
      if (!fits(order, smallCtx, smallOptions)) continue;
      feasibleOrders += 1;
      best = Math.max(best, objectiveFast(buildStops(order, smallCtx, smallOptions), smallCtx).value);
    }
    // 34 of the 210 orders are feasible, so the reference is a real search and
    // not an empty set the gap would read as a divide by zero.
    expect(feasibleOrders).toBe(34);
    expect(got.objective.value).toBeLessThanOrEqual(best + 1e-9);
    const gap = (best - got.objective.value) / Math.max(1e-9, Math.abs(best));
    // The 3 percent contract pack.ts documents, restored. The temporary 0.38
    // ceiling went when the search stopped maximising the objective over orders
    // the window cannot hold: this instance's feasible 3 stop plan at 5.806 is
    // now the plan that comes back, and the gap closed to nothing.
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
