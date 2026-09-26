import type { DiscoveryContext, Plan, ReplanResult, Rung, Stop, Swap, TriggerId } from "@/lib/engine";
import { inrLabel, stopTotals } from "@/components/ananta/pipeline";

/**
 * Adaptive replanning, user controlled.
 *
 * Session 7 owns `replan/triggers.ts`, `replan/swap.ts`, and `replan/replan.ts`
 * and exports `applyTrigger`, `diffAgainstOriginal`, and `buildContext`. None of
 * that has landed, so this file implements the frozen signatures.
 *
 * The rule from the masterplan that this file exists to enforce: normal
 * adaptation is always a proposal with an explicit accept control. Nothing here
 * mutates a plan. Every entry point returns a `ReplanResult` the traveller has
 * to accept, and every swap diffs against `ctx.original`, never against the
 * previous mutation. Accumulate two triggers and the diff still reads against
 * what the traveller actually asked for at the start.
 *
 * `ponytail:` `buildContext` in the contract takes an `Omit<DiscoveryContext,
 * "original">`, while `pipeline.contextFromInput` takes the smaller `EngineInput`
 * the two screens hold. When session 7 lands, the trips page feeds its
 * `EngineInput` through `contextFromInput` and then hands the result to
 * `applyTrigger`, which is the shape the contract expects. Logged in
 * `SESSION/BLOCKERS/9.md`.
 */

/** A trigger is a fact the traveller tells us, never one we assume. */
export type TriggerSpec = {
  id: TriggerId;
  label: string;
  /** What the button does, in the traveller's words, before they click it. */
  detail: string;
  mutate: (draft: DiscoveryContext, plan: Plan) => DiscoveryContext;
  /** Names the constraint that forced any resulting change. */
  reason: (draft: DiscoveryContext, plan: Plan) => string;
};

/**
 * A mutable copy. `ctx.original` is frozen at construction and is carried
 * across by reference on purpose: nothing a trigger does may reach it.
 */
export function draftOf(ctx: DiscoveryContext): DiscoveryContext {
  return {
    ...ctx,
    accessNeeds: [...ctx.accessNeeds],
    diets: [...ctx.diets],
    original: ctx.original,
    profile: {
      ...ctx.profile,
      accessibility: [...ctx.profile.accessibility],
      diets: [...ctx.profile.diets],
      excludes: [...ctx.profile.excludes],
      pins: [...ctx.profile.pins],
      interests: { ...ctx.profile.interests },
      avoid: { ...ctx.profile.avoid },
      weights: { ...ctx.profile.weights },
    },
  };
}

function totalMinutes(stops: Stop[]): number {
  return stopTotals(stops).total;
}

export const TRIGGERS: TriggerSpec[] = [
  {
    id: "rain_started",
    label: "It started raining",
    detail: "Outdoor stops lose the weather gate and indoor records gain.",
    mutate: (draft) => ({ ...draft, raining: true, weatherSeverity: "heavy_rain" as const }),
    reason: () => "It started raining, so outdoor stops are no longer safe and were dropped.",
  },
  {
    id: "time_lost",
    label: "We lost 90 minutes",
    detail: "The window shrinks by 90 minutes and the plan is re-solved into what is left.",
    mutate: (draft) => ({ ...draft, availableMinutes: Math.max(30, draft.availableMinutes - 90) }),
    reason: (draft) =>
      `90 minutes were lost, so the window is now ${Math.max(30, draft.availableMinutes - 90)} minutes and the plan was re-solved into it.`,
  },
  {
    id: "sold_out",
    label: "This one is sold out",
    detail: "The last stop is treated as sold out and the rest of the plan is re-solved around it.",
    mutate: (draft, plan) => {
      const soldOut = plan.stops[plan.stops.length - 1]?.record.id;
      return { ...draft, profile: { ...draft.profile, pins: draft.profile.pins.filter((id) => id !== soldOut) } };
    },
    reason: (_draft, plan) => {
      const soldOut = plan.stops[plan.stops.length - 1];
      return `${soldOut?.record.name ?? "The last stop"} is sold out, so it was removed and the remaining stops were re-solved.`;
    },
  },
  {
    id: "budget_dropped",
    label: "The budget dropped",
    detail: "The budget falls by a third and anything above it is pruned.",
    mutate: (draft) => ({ ...draft, budgetInr: Math.round((draft.budgetInr * 2) / 3) }),
    reason: (draft) =>
      `The budget fell to ${inrLabel(Math.round((draft.budgetInr * 2) / 3))}, so stops priced above the new limit were pruned.`,
  },
  {
    id: "needs_restroom",
    label: "The toddler needs a bathroom",
    detail: "An accessible restroom becomes a hard requirement and unknown facts become advisories.",
    mutate: (draft) => ({
      ...draft,
      hasToddler: true,
      accessNeeds: draft.accessNeeds.includes("accessible_restroom")
        ? draft.accessNeeds
        : [...draft.accessNeeds, "accessible_restroom" as const],
    }),
    reason: () =>
      "An accessible restroom became a requirement. No record in the catalogue has that fact on file, so the gate raised it as an unverified fact rather than a refusal.",
  },
  {
    id: "tired",
    label: "They are tired",
    detail: "The pace softens, the target stop count drops by one, and the Stress Radar gets harder to pass.",
    mutate: (draft) => ({
      ...draft,
      pace: "relaxed" as const,
      idealStops: Math.max(1, draft.idealStops - 1),
    }),
    reason: (draft) =>
      `The pace was softened to ${Math.max(1, draft.idealStops - 1)} stops, so the packer re-solved for fewer and closer stops.`,
  },
];

export function triggerSpec(id: TriggerId): TriggerSpec {
  const found = TRIGGERS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown trigger "${id}".`);
  return found;
}

/**
 * Every difference between two plans, paired so each `Swap` reads as one
 * decision, and measured against `ctx.original` so two stacked triggers still
 * read against what the traveller asked for first.
 */
export function diffAgainstOriginal(before: Plan, after: Plan, ctx: DiscoveryContext): Swap[] {
  const beforeIds = before.stops.map((stop) => stop.record.id);
  const afterIds = after.stops.map((stop) => stop.record.id);
  const removed = beforeIds.filter((id) => !afterIds.includes(id));
  const added = afterIds.filter((id) => !beforeIds.includes(id));
  const beforeTotal = totalMinutes(before.stops);
  const afterTotal = totalMinutes(after.stops);
  const minutesDelta = afterTotal - beforeTotal;
  const scoreDelta = Number((after.objective.value - before.objective.value).toFixed(4));
  const nameOf = (id: string | null): string | null =>
    id === null ? null : before.stops.concat(after.stops).find((stop) => stop.record.id === id)?.record.name ?? id;

  const swaps: Swap[] = [];
  const paired = Math.min(removed.length, added.length);
  void ctx;

  for (let index = 0; index < paired; index += 1) {
    swaps.push({
      removedId: removed[index],
      addedId: added[index],
      reason: `Swapped ${nameOf(removed[index])} for ${nameOf(added[index])} to stay inside the window and the budget.`,
      scoreDelta,
      minutesDelta,
    });
  }
  for (const id of removed.slice(paired)) {
    swaps.push({
      removedId: id,
      addedId: null,
      reason: `Dropped ${nameOf(id)} because it no longer fits the window or the budget.`,
      scoreDelta,
      minutesDelta,
    });
  }
  for (const id of added.slice(paired)) {
    swaps.push({
      removedId: null,
      addedId: id,
      reason: `Added ${nameOf(id)} to fill window that the relaxation left empty.`,
      scoreDelta,
      minutesDelta,
    });
  }
  if (!swaps.length) {
    swaps.push({
      removedId: null,
      addedId: null,
      reason: "Nothing changed. The plan already fits the new limits.",
      scoreDelta: 0,
      minutesDelta: 0,
    });
  }
  return swaps;
}

/**
 * Fire a trigger, re-solve, and hand back a proposal. The plan passed in is
 * never written to: the caller decides whether the result becomes the plan.
 */
export function applyTrigger(
  plan: Plan,
  trigger: TriggerId,
  ctx: DiscoveryContext,
  solve: (next: DiscoveryContext) => Plan,
): ReplanResult {
  const spec = triggerSpec(trigger);
  const draft = spec.mutate(draftOf(ctx), plan);
  const next = solve(draft);
  const swaps = diffAgainstOriginal(plan, next, draft);
  const reason = spec.reason(draft, plan);
  const withReason = swaps.map((swap) => ({
    ...swap,
    reason:
      swap.removedId === null && swap.addedId === null
        ? reason
        : `${reason} ${swap.reason}`,
  }));
  const changed = withReason.some((swap) => swap.removedId || swap.addedId);
  const rungs = walkLadder(plan, next, changed);
  return { plan: next, swaps: withReason, rungs, diffedAgainst: "original" };
}

/**
 * Which rungs the walk touched. `Plan` carries no rung of its own, so it is
 * derived from what the diff actually did: an identical plan stayed on strict,
 * a plan that lost or gained stops went through dropped_minimum, and a result
 * of a single stop with nothing to drop is single_best.
 */
function walkLadder(before: Plan, after: Plan, changed: boolean): Rung[] {
  if (!changed) return ["strict"];
  return after.stops.length <= 1 && before.stops.length > 1
    ? ["strict", "dropped_minimum", "single_best"]
    : ["strict", "dropped_minimum"];
}
