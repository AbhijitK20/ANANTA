import type {
  DiscoveryContext,
  ExperienceV2,
  Plan,
  RejectionCode,
  Rung,
  Stop,
  Swap,
  ValidationResult,
} from "@/lib/engine/contracts";
import { gate } from "@/lib/engine/feasibility";
import { pack } from "@/lib/engine/packing";
import { objectiveFast } from "@/lib/engine/scoring";
import { relax, validate } from "@/lib/engine/validation";
import { diffAgainstOriginal } from "./swap";

/**
 * The search bound. Removals of size 0, 1, then 2, and the search stops at the
 * first size that yields a validated plan. The demo metric is median 2 swaps per
 * context change, so a bound of 2 is the metric itself, not an approximation of
 * it.
 *
 * ponytail: at most `1 + n + n(n-1)/2` pack calls, which is 326 at a 25 stop
 * plan. That is why a size 3 search is not merely slower, it is a different
 * product promise, and it would move the median. Upgrade path if the bound ever
 * needs raising: prune subsets by the objective the plan loses, so the size 3
 * round only visits the top 20 percent.
 */
export const MAX_EXTRA_REMOVALS = 2;

/** One pass per rung in the frozen `Rung` union. Bounded, never a live loop. */
export const MAX_LADDER_STEPS = 4;

/** Everything the search needs from the outside. Nothing is fetched inside. */
export interface ReplanDeps {
  /** Precomputed pairwise travel. Injected, per the packing contract. */
  matrix: (aId: string, bId: string) => { minutes: number; km: number };
  /** Travel from where the traveller is standing. */
  originMinutes: (id: string) => { minutes: number; km: number };
  /** The visit window a candidate would be given in the plan. */
  windowFor: (record: ExperienceV2) => { startMin: number; endMin: number };
  seed?: number;
  beamWidth?: number;
  iters?: number;
}

export type RelaxFn = (
  stops: readonly Stop[],
  ctx: DiscoveryContext,
  cause: ValidationResult,
) => { stops: Stop[]; rung: Rung; note: string } | null;

export interface LadderWalk {
  stops: Stop[];
  /** Rungs walked, in order, starting at the one the solver returned. */
  rungs: Rung[];
  note: string;
  /** `false` when the ladder ran out with the plan still breaking a hard check. */
  ok: boolean;
}

export interface MinimalSwapResult {
  plan: Plan;
  swaps: Swap[];
  rungs: Rung[];
  /** One plain sentence, numbers included, for the proposal card. */
  note: string;
  /** Voluntary removals searched for. `0` means the forced removals were enough. */
  size: number;
  /** Ids the new limits invalidated before any search started. */
  forced: string[];
  /** How many plans were actually evaluated. */
  attempts: number;
}

const strictNote = "It fits every hard check as it stands.";
const singleBestNote = "Cut back to the single best stop that still fits, because nothing smaller passes.";

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** The best single stop on plan quality, then on id, so it never wobbles. */
const bestSingle = (stops: readonly Stop[], ctx: DiscoveryContext): Stop | null => {
  let best: Stop | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const stop of stops) {
    const value = objectiveFast([stop], ctx).value;
    if (best === null || value > bestValue || (value === bestValue && stop.record.id < best.record.id)) {
      best = stop;
      bestValue = value;
    }
  }
  return best;
};

/**
 * Walks session 6's ladder and, if session 6 declines to relax any further,
 * takes the smallest rung itself. The plan that comes back has been through
 * `validate`, which is the point: returning an unvalidated plan is the defect
 * this stage exists to remove.
 *
 * `relaxFn` is injectable so the decline branch is testable without depending on
 * another session's implementation choices. It defaults to the real ladder.
 */
export function walkLadder(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
  relaxFn: RelaxFn = relax,
  startRung: Rung = "strict",
): LadderWalk {
  const rungs: Rung[] = [startRung];
  let current = [...stops];
  let note = strictNote;

  for (let step = 0; step < MAX_LADDER_STEPS; step += 1) {
    const check = validate(current, ctx, objectiveFast(current, ctx));
    if (check.ok) return { stops: current, rungs, note, ok: true };
    if (current.length === 0) {
      return {
        stops: current,
        rungs,
        note: "Nothing in the catalogue fits the current limits, so this proposal is empty.",
        ok: false,
      };
    }
    const relaxed = relaxFn(current, ctx, check);
    if (relaxed) {
      current = [...relaxed.stops];
      rungs.push(relaxed.rung);
      note = relaxed.note;
      continue;
    }
    if (current.length > 1) {
      const single = bestSingle(current, ctx);
      if (!single) {
        return { stops: current, rungs, note, ok: false };
      }
      current = [single];
      rungs.push("single_best");
      note = singleBestNote;
      continue;
    }
    return {
      stops: current,
      rungs,
      note: `Even the single best stop does not fit: ${check.issues[0]?.sentence ?? "a hard check still fails"}.`,
      ok: false,
    };
  }

  const last = validate(current, ctx, objectiveFast(current, ctx));
  return {
    stops: current,
    rungs,
    note: last.ok
      ? note
      : `Stopped walking the ladder after ${plural(rungs.length, "rung", "rungs")}. ${last.issues[0]?.sentence ?? "A hard check still fails."}`,
    ok: last.ok,
  };
}

/**
 * Codes the gate raises by holding ONE record against the WHOLE resource. They
 * answer "could this record ever sit in any plan under these limits", which is a
 * candidate filter, and not "must this stop leave this plan", which is the only
 * question `forcedRemovals` is allowed to ask.
 *
 * `checkTime` compared `travel + duration + BUFFER` for a record against all of
 * `availableMinutes`, ignoring every other stop, so a window that shrank below
 * one stop's own need marked every stop forced. `survivors` went empty, the
 * size ladder had nothing left to search, and the "smallest fix" degenerated
 * into a full repack. Measured on a 228 minute plan cut to a 190 minute window:
 * all three stops forced, one attempt, an unrelated stop offered, while the
 * plan's own first two stops fitted in 152 minutes and validated. The exact
 * opposite of minimal.
 *
 * `over_budget_per_person` and `too_far` are deliberately absent. One head
 * costing more than the entire budget, or an origin leg longer than the entire
 * window, cannot be planned around at all, so those still force a stop out.
 */
const SHARED_RESOURCE_CODES: ReadonlySet<RejectionCode> = new Set([
  "duration_exceeds_budget",
  "travel_time_exceeds_budget",
  "over_budget",
]);

/** Stops the new limits rule out, in plan order, de-duplicated. */
function forcedRemovals(plan: Plan, ctx: DiscoveryContext, deps: ReplanDeps): string[] {
  const check = validate(plan.stops, ctx, objectiveFast(plan.stops, ctx));
  if (check.ok) return [];

  const inPlan = new Set(plan.stops.map((stop) => stop.record.id));
  const named = check.issues
    .map((issue) => issue.offendingId)
    .filter((id): id is string => typeof id === "string" && inPlan.has(id));
  if (named.length) return uniqueInOrder(named);

  // The validator did not name a stop, so the plan level failure is shared. Ask
  // the gate which of the stops it owns individually, and take only those: a
  // rejection it raised against the whole window or the whole budget is a
  // statement about the resource, not about one stop's place in this plan, and
  // reading it as a membership decision is what emptied `survivors`.
  const gated = gate(
    plan.stops.map((stop) => stop.record),
    ctx,
    { windowFor: deps.windowFor },
  );
  const blocked = new Set(
    gated.rejected
      .filter((entry) =>
        entry.rejections.some(
          (rejection) => rejection.blocking && !SHARED_RESOURCE_CODES.has(rejection.code),
        ),
      )
      .map((entry) => entry.record.id),
  );
  return plan.stops.filter((stop) => blocked.has(stop.record.id)).map((stop) => stop.record.id);
}

const uniqueInOrder = (ids: readonly string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
};

/** Every subset of `size`, in index order. Deterministic, no Set iteration. */
const combinations = <T,>(items: readonly T[], size: number): T[][] => {
  if (size === 0) return [[]];
  const out: T[][] = [];
  const walk = (start: number, chosen: T[]): void => {
    if (chosen.length === size) {
      out.push([...chosen]);
      return;
    }
    for (let i = start; i < items.length; i += 1) {
      chosen.push(items[i]);
      walk(i + 1, chosen);
      chosen.pop();
    }
  };
  walk(0, []);
  return out;
};

const objectiveOf = (stops: readonly Stop[], ctx: DiscoveryContext): number =>
  stops.length ? objectiveFast([...stops], ctx).value : 0;

const stopIds = (stops: readonly Stop[]): string[] => stops.map((stop) => stop.record.id);

const totalMinutes = (stops: readonly Stop[]): number => {
  let total = 0;
  for (const stop of stops) total += stop.travelMinutes + stop.visitMinutes + stop.bufferMinutes;
  return total;
};

/** Stable id from the context and the stop order. No clock, no counter. */
export function planId(ctx: DiscoveryContext, stops: readonly Stop[]): string {
  let hash = 0x811c9dc5;
  const text = `${ctx.profile.id}|${ctx.now}|${ctx.availableMinutes}|${ctx.budgetInr}|${stopIds(stops).join(">")}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `plan-${hash.toString(16).padStart(8, "0")}`;
}

const asPlan = (stops: readonly Stop[], ctx: DiscoveryContext): Plan => ({
  id: planId(ctx, stops),
  stops: [...stops],
  objective: objectiveFast([...stops], ctx),
  createdFrom: ctx,
});

interface Attempt {
  stops: Stop[];
  rungs: Rung[];
  note: string;
  ok: boolean;
  additions: number;
  value: number;
  minutes: number;
  signature: string;
}

/**
 * Fewest additions first, then highest plan quality, then least time, then
 * lexicographic. The first key is the demo metric, the second is the objective,
 * and the last two only exist so two equally good plans never swap places
 * between runs.
 */
const better = (candidate: Attempt, best: Attempt): boolean => {
  if (candidate.additions !== best.additions) return candidate.additions < best.additions;
  if (candidate.value !== best.value) return candidate.value > best.value;
  if (candidate.minutes !== best.minutes) return candidate.minutes < best.minutes;
  return candidate.signature < best.signature;
};

/**
 * The smallest set of substitutions that restores feasibility.
 *
 * Every stop the new limits invalidate is removed in one pass, before any
 * search. That single ordering is the fix for the bug this stage replaces: the
 * old suggester evaluated each closure against the *original* remaining plan, so
 * two simultaneous closures each looked individually fixable and the pair was
 * never checked. Here the pair is the only thing that is ever built, and it is
 * built through `pack` and put through `validate` before it can be returned.
 *
 * Returns a result for every input, including "nothing fits", so the caller
 * always has a proposal to show. It never throws on infeasibility.
 */
export function minimalSwapSet(
  plan: Plan,
  ctx: DiscoveryContext,
  candidates: readonly ExperienceV2[],
  deps: ReplanDeps,
  relaxFn: RelaxFn = relax,
): MinimalSwapResult {
  const forced = forcedRemovals(plan, ctx, deps);
  const forcedIds = new Set(forced);
  const survivors = plan.stops.filter((stop) => !forcedIds.has(stop.record.id)).map((stop) => stop.record);
  const survivorIds = new Set(survivors.map((record) => record.id));
  const pool = candidates.filter((record) => !forcedIds.has(record.id) && !survivorIds.has(record.id));

  let attempts = 0;
  let bestEffort: Attempt | null = null;

  for (let size = 0; size <= MAX_EXTRA_REMOVALS; size += 1) {
    let best: Attempt | null = null;
    for (const dropped of combinations(survivors, size)) {
      const droppedIds = new Set(dropped.map((record) => record.id));
      const kept = survivors.filter((record) => !droppedIds.has(record.id));
      attempts += 1;
      const attempt = evaluate([...kept, ...pool], plan, ctx, deps);
      if (!best || better(attempt, best)) best = attempt;
    }
    // The last size's best is the closest we got to the traveller's own plan,
    // which is what the fallback below should offer.
    if (best) bestEffort = best;
    if (best && best.ok) return finish(plan, ctx, best, forced, attempts, relaxFn);
  }

  // Nothing in the bound validated. Offer the closest thing that was built, so
  // the traveller sees a real proposal and a real reason rather than an error.
  return finish(plan, ctx, bestEffort ?? evaluate([], plan, ctx, deps), forced, attempts, relaxFn);
}

/**
 * Feasibility is measured here, straight, with `validate`. The ladder is not
 * walked inside the search, because a ladder that rescues a broken attempt
 * would make every size look feasible and the search would always stop at zero.
 * The ladder runs once, on the answer, in `finish`.
 */
const evaluate = (
  input: readonly ExperienceV2[],
  plan: Plan,
  ctx: DiscoveryContext,
  deps: ReplanDeps,
): Attempt => {
  if (!input.length) {
    return {
      stops: [],
      rungs: ["strict"],
      note: "Nothing left to place: the current limits rule out every stop in the plan and nothing in the catalogue replaces them.",
      ok: false,
      additions: 0,
      value: 0,
      minutes: 0,
      signature: "",
    };
  }
  const packed = pack([...input], ctx, {
    matrix: deps.matrix,
    originMinutes: deps.originMinutes,
    seed: deps.seed,
    beamWidth: deps.beamWidth,
    iters: deps.iters,
  });
  const check = validate(packed.stops, ctx, objectiveFast(packed.stops, ctx));
  const planIds = new Set(stopIds(plan.stops));
  return {
    stops: packed.stops,
    rungs: [packed.rung],
    note: check.ok ? "It fits every hard check as it stands." : failingNote(check),
    ok: check.ok,
    additions: stopIds(packed.stops).filter((id) => !planIds.has(id)).length,
    value: objectiveOf(packed.stops, ctx),
    minutes: totalMinutes(packed.stops),
    signature: stopIds(packed.stops).join(">"),
  };
};

const failingNote = (check: ValidationResult): string => {
  const first = check.issues[0];
  return first ? `${first.sentence} Nothing smaller in the search passed either.` : "A hard check still fails.";
};

const finish = (
  plan: Plan,
  ctx: DiscoveryContext,
  attempt: Attempt,
  forced: readonly string[],
  attempts: number,
  relaxFn: RelaxFn,
): MinimalSwapResult => {
  const walked = walkLadder(attempt.stops, ctx, relaxFn, attempt.rungs[0]);
  const proposal = asPlan(walked.stops, ctx);
  const swaps = diffAgainstOriginal(plan, proposal, ctx);
  // The honest count is the number of still-planned stops the proposal actually
  // dropped, which is the search size in the happy path and the truth in the
  // fallback.
  const forcedIds = new Set(forced);
  const proposed = new Set(stopIds(walked.stops));
  const size = plan.stops.filter(
    (stop) => !forcedIds.has(stop.record.id) && !proposed.has(stop.record.id),
  ).length;
  const note =
    `Smallest fix found after checking ${plural(attempts, "plan", "plans")}: ` +
    `${plural(forced.length, "stop", "stops")} the new limits rule out and ` +
    `${plural(size, "swap", "swaps")} on top. ` +
    walked.note;
  return {
    plan: proposal,
    swaps,
    rungs: walked.rungs,
    note,
    size,
    forced: [...forced],
    attempts,
  };
};
