import type {
  DiscoveryContext,
  ExperienceV2,
  Rung,
  Stop,
  ValidationIssue,
  ValidationResult,
} from "@/lib/engine/contracts/types";
import { checkBudget, checkCapacity, checkLeadTime, partyCostInr } from "./budget";
import { distanceFromOriginKm, haversineKm } from "./distance-naive";
import { objectiveNaive } from "./objective-naive";
import { checkConditions, checkWindows, minutesOfDay } from "./window";

/**
 * The named relaxation ladder from `MASTERPLAN.md` section 3.4.
 *
 *   strict -> dropped_minimum -> greedy_fill -> single_best
 *
 * Every rung returns a note in the traveller's language that names the number
 * that changed. "Relaxed: minimum 1 stop instead of 2" is a far better demo than
 * an unsat core, and unlike an unsat core it is honest. Returning `null` is a
 * normal outcome, not an error: it means this rung cannot produce anything that
 * passes and the caller should walk down.
 *
 * Feasibility is re-derived with this directory's own `window.ts` and
 * `budget.ts` checks. The gate in `feasibility/` is not imported, for the same
 * reason the ladder does not import the objective: a checker that stands on the
 * thing it is checking is one derivation wearing two hats.
 *
 * ponytail: `greedy_fill` takes its candidate records as an injected `pool`
 * rather than importing `pack()` from `packing/`. Two reasons. A static import
 * of a stage that may not exist yet takes every test in this directory down
 * with it, and a validator that constructs its own fixups through the packer
 * cannot tell whether the packer or the check is wrong. When session 5 lands,
 * the caller (session 7's `solve`) already holds a packed plan, so passing its
 * shortlist in costs nothing.
 */

export interface RelaxOptions {
  /** Records to draw from when refilling. Injected, never imported. */
  pool?: readonly ExperienceV2[];
}

export interface Relaxed {
  stops: Stop[];
  rung: Rung;
  note: string;
}

/** Every hard check this directory knows how to make, in one place. */
export function hardIssues(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
): ValidationIssue[] {
  return [
    ...checkWindows(stops, ctx),
    ...checkConditions(stops, ctx),
    ...checkBudget(stops, ctx),
    ...checkCapacity(stops, ctx),
    ...checkLeadTime(stops),
  ];
}

function lastEnd(stops: readonly Stop[]): number {
  if (stops.length === 0) return 0;
  const last = stops[stops.length - 1];
  return last.arriveBy + last.visitMinutes + last.bufferMinutes;
}

/** Longest leading run of stops that passes every hard check. May be empty. */
function feasibleCore(stops: readonly Stop[], ctx: DiscoveryContext): Stop[] {
  for (let k = stops.length; k > 0; k -= 1) {
    const head = stops.slice(0, k);
    if (hardIssues(head, ctx).length === 0) return head;
  }
  return [];
}

/**
 * Build a candidate stop appended after `after`.
 *
 * ponytail: the leg is estimated by scaling the record's own origin travel time
 * by the ratio of the leg distance to its origin distance, because this
 * directory refuses to take a routing matrix. That is an estimate and the debug
 * view should say so. Upgrade path is one injected distance function.
 */
function appendStop(
  record: ExperienceV2,
  after: readonly Stop[],
  ctx: DiscoveryContext,
): Stop {
  const previous = after[after.length - 1];
  const legFrom = previous
    ? ([previous.record.coordinates[0], previous.record.coordinates[1]] as [number, number])
    : ctx.origin.coordinates;
  const here: [number, number] = [record.coordinates[0], record.coordinates[1]];
  const legKm = haversineKm(legFrom, here);
  const originKm = distanceFromOriginKm(record, ctx.origin.coordinates);
  const travelMinutes =
    originKm > 1e-9 ? (record.travelMinutes * legKm) / originKm : record.travelMinutes;
  const startFrom =
    previous === undefined
      ? minutesOfDay(ctx.now)
      : previous.arriveBy + previous.visitMinutes + previous.bufferMinutes;
  return {
    record,
    arriveBy: Math.round(startFrom + travelMinutes),
    travelMinutes: Math.round(travelMinutes),
    travelKm: legKm,
    visitMinutes: record.durationMinutes,
    bufferMinutes: 0,
    costInr: partyCostInr(record.priceInr, ctx.partySize),
  };
}

function isBlocked(record: ExperienceV2, ctx: DiscoveryContext): boolean {
  return ctx.profile.excludes.indexOf(record.id) !== -1;
}

export function relax(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
  cause: ValidationResult,
  options: RelaxOptions = {},
): Relaxed | null {
  if (stops.length === 0) return null;

  if (hardIssues(stops, ctx).length === 0) {
    return {
      stops: stops.slice(),
      rung: "strict",
      note: `Kept all ${stops.length} ${
        stops.length === 1 ? "stop" : "stops"
      } with every check satisfied; ${cause.issues.length} ${
        cause.issues.length === 1 ? "issue" : "issues"
      } did not reproduce.`,
    };
  }

  const dropped = dropMinimum(stops, ctx);
  if (dropped) return dropped;

  const filled = greedyFill(stops, ctx, options.pool ?? []);
  if (filled) return filled;

  return singleBest(stops, ctx);
}

function dropMinimum(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
): Relaxed | null {
  const ceiling = Math.min(stops.length, ctx.minStops - 1);
  for (let k = ceiling; k >= 1; k -= 1) {
    const head = stops.slice(0, k);
    if (hardIssues(head, ctx).length !== 0) continue;
    return {
      stops: head,
      rung: "dropped_minimum",
      note: `Relaxed: minimum ${k} ${k === 1 ? "stop" : "stops"} instead of ${ctx.minStops}.`,
    };
  }
  return null;
}

function greedyFill(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
  pool: readonly ExperienceV2[],
): Relaxed | null {
  // A refill needs something to refill from. With no shortlist there is no
  // greedy fill to do, so this rung steps aside and lets `single_best` answer.
  if (pool.length === 0) return null;

  let core = feasibleCore(stops, ctx);
  const target = Math.max(1, ctx.minStops);
  const remaining = pool
    .filter((record) => !isBlocked(record, ctx))
    .filter(
      (record) =>
        core.every((stop) => stop.record.id !== record.id) &&
        stops.every((stop) => stop.record.id !== record.id),
    )
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const spent: ExperienceV2[] = [];
  // Distinct candidates the shortlist offered and the checks refused. Counted
  // by identity, not per attempt, so the note does not inflate with iterations.
  const refusedIds = new Set<string>();
  while (core.length < target && remaining.length > 0) {
    let winner: Stop | null = null;
    let winnerScore = Number.NEGATIVE_INFINITY;
    let winnerIndex = -1;
    for (let i = 0; i < remaining.length; i += 1) {
      const trial = core.concat(appendStop(remaining[i], core, ctx));
      if (hardIssues(trial, ctx).length !== 0) {
        refusedIds.add(remaining[i].id);
        continue;
      }
      const score = objectiveNaive(trial, ctx).value;
      if (score > winnerScore) {
        winner = trial[trial.length - 1];
        winnerScore = score;
        winnerIndex = i;
      }
    }
    if (winnerIndex === -1 || winner === null) break;
    core = core.concat(winner);
    spent.push(remaining[winnerIndex]);
    remaining.splice(winnerIndex, 1);
  }

  if (core.length === 0) return null;
  if (hardIssues(core, ctx).length !== 0) return null;

  const added = spent.length;
  const kept = core.length - added;
  const dropped = stops.length - kept;
  const refused = refusedIds.size;
  const note =
    added > 0
      ? (kept === 0
          ? `Rebuilt from the shortlist: added back ${added} ${
              added === 1 ? "stop" : "stops"
            }, all passing every check, and gave up ${dropped}.`
          : `Kept ${kept} ${kept === 1 ? "stop" : "stops"}, added back ${added} that still pass every check, and gave up ${dropped} ${
              dropped === 1 ? "stop" : "stops"
            }.`) +
        (refused > 0
          ? ` ${refused} ${refused === 1 ? "candidate" : "candidates"} from the shortlist failed every check.`
          : "")
      : `Kept ${kept} ${kept === 1 ? "stop" : "stops"} and added 0, because the core already meets the minimum of ${ctx.minStops}.`;
  return { stops: core, rung: "greedy_fill", note };
}

function singleBest(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
): Relaxed | null {
  const singles = stops.map((stop) => [stop] as Stop[]);
  let winner: Stop[] | null = null;
  let winnerScore = Number.NEGATIVE_INFINITY;
  for (const single of singles) {
    if (hardIssues(single, ctx).length !== 0) continue;
    const score = objectiveNaive(single, ctx).value;
    if (score > winnerScore) {
      winner = single;
      winnerScore = score;
    }
  }
  if (winner === null) return null;
  return {
    stops: winner,
    rung: "single_best",
    note: `Reduced to 1 stop, the best of ${stops.length} that passes every check.`,
  };
}
