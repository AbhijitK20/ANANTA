import type { DiscoveryContext, ExperienceV2, Rejection, RejectionCode } from "@/lib/engine/contracts";
import { CHECKS } from "./checks";
import type { Check, GatePosition } from "./checks";
import { defaultWindowFor, localClock, normaliseWindow, travelMinutesFor } from "./checks/time";

/**
 * The gate. Runs every check against every candidate, keeps the whole rejection
 * list, and never scores or sorts anything it has already thrown away.
 */

export interface GateOptions {
  /** Visit window per candidate, computed from the plan position. */
  windowFor: (record: ExperienceV2) => { startMin: number; endMin: number };
  /**
   * Stops already in the plan, for proximity duplicate detection. Injected
   * because `DiscoveryContext` deliberately carries no coordinates of its own.
   */
  plannedStops?: { id: string; coordinates: [number, number] }[];
}

export interface GateResult {
  passed: ExperienceV2[];
  rejected: { record: ExperienceV2; rejections: Rejection[] }[];
  /** Every rejection, flattened, including the non-blocking ones. */
  stream: { id: string; rejections: Rejection[] }[];
}

/**
 * Blocking first, then how badly it missed, then by code so the order never
 * depends on anything but the numbers. Stable for identical triples, which are
 * indistinguishable anyway.
 */
export function sortRejections(rejections: Rejection[]): Rejection[] {
  return rejections.slice().sort((a, b) => {
    if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
    if ((a.shortfall ?? 0) !== (b.shortfall ?? 0)) return (b.shortfall ?? 0) - (a.shortfall ?? 0);
    return a.code.localeCompare(b.code);
  });
}

/**
 * All eleven checks, always, in cost order.
 *
 * ponytail: this deliberately does not stop at the first blocking rejection.
 * The masterplan's short circuit is premature, because ~120 candidates times
 * eleven pure checks is microseconds, and stopping early would hide the second
 * and third reason a record failed, which is the whole point of the product.
 * Upgrade path: `GateOptions.shortCircuit` once a profile says it matters.
 */
export function runChecks(record: ExperienceV2, ctx: DiscoveryContext, position: GatePosition): Rejection[] {
  const rejections: Rejection[] = [];
  for (const check of CHECKS) {
    for (const rejection of check(record, ctx, position)) rejections.push(rejection);
  }
  return sortRejections(rejections);
}

function buildPosition(
  record: ExperienceV2,
  ctx: DiscoveryContext,
  windowFor: GateOptions["windowFor"],
  clock: { weekday: number; minutes: number; month: number },
  planned: GatePosition["planned"],
): GatePosition {
  const raw = windowFor(record);
  const window = normaliseWindow(raw.startMin, raw.endMin);
  return {
    travelMinutes: travelMinutesFor(record, ctx),
    startOffsetMin: window.startMin - clock.minutes,
    window: { startMin: window.startMin, endMin: window.endMin },
    weekday: ((clock.weekday + window.dayShift) % 7 + 7) % 7,
    month: clock.month,
    planned,
  };
}

export function gate(
  records: ExperienceV2[],
  ctx: DiscoveryContext,
  options: GateOptions,
): GateResult {
  const windowFor = options?.windowFor ?? defaultWindowFor(ctx);
  const clock = localClock(ctx.now, ctx.city.timezone);
  const planned: GatePosition["planned"] = (options?.plannedStops ?? []).slice();
  const passed: ExperienceV2[] = [];
  const rejected: { record: ExperienceV2; rejections: Rejection[] }[] = [];
  const stream: { id: string; rejections: Rejection[] }[] = [];

  for (const record of records) {
    const rejections = runChecks(record, ctx, buildPosition(record, ctx, windowFor, clock, planned));
    if (rejections.some((rejection) => rejection.blocking)) {
      rejected.push({ record, rejections });
      stream.push({ id: record.id, rejections });
      continue;
    }
    passed.push(record);
    // Only accepted records can make a later candidate a duplicate. Two
    // rejected neighbours are two rejections, not a duplicate pair.
    planned.push({ id: record.id, coordinates: record.coordinates });
  }

  return { passed, rejected, stream };
}

/**
 * The single most frequent blocking code, which is the "what actually killed
 * it" line the provider feed leads with. Ties go to the largest total
 * shortfall, then to the alphabetically first code, so the answer is a pure
 * function of the input. All or nothing: no blocking rejection means no answer.
 * ponytail: shortfalls in mixed units are summed, which is only a tie break
 * between equally frequent codes, and the unit is still reported on the result.
 */
export function dominantRejection(rejections: Rejection[]): Rejection | null {
  const blocking = rejections.filter((rejection) => rejection.blocking);
  if (!blocking.length) return null;

  const tally = new Map<RejectionCode, { count: number; total: number; best: Rejection }>();
  for (const rejection of blocking) {
    const magnitude = rejection.shortfall ?? 0;
    const entry = tally.get(rejection.code);
    if (!entry) {
      tally.set(rejection.code, { count: 1, total: magnitude, best: rejection });
      continue;
    }
    entry.count += 1;
    entry.total += magnitude;
    if (magnitude > (entry.best.shortfall ?? 0)) entry.best = rejection;
  }

  const codes = Array.from(tally.keys()).sort((a, b) => {
    const left = tally.get(a);
    const right = tally.get(b);
    if (!left || !right) return a.localeCompare(b);
    return right.count - left.count || right.total - left.total || a.localeCompare(b);
  });

  const winner = tally.get(codes[0]);
  return winner ? winner.best : null;
}

export type { Check, GatePosition };
