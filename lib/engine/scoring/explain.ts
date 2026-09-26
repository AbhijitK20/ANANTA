import type { ComponentId, DiscoveryContext, Objective, ScoreComponent, Stop, Weights } from "@/lib/engine/contracts";
import { COMPONENT_IDS, scoreStop } from "./components";
import { WEIGHT_COMPONENT_KEYS } from "./weights";

/**
 * "Why this", ranked.
 *
 * The current product pushes reasons in the order of a fixed `if` chain and then
 * does `reasons.slice(0, 3)`, which is not a ranking by anything: it happens to
 * show the first three conditions that happened to be true. This sorts by
 * absolute contribution, so the panel leads with whatever actually moved the
 * number, and ties fall back to `COMPONENT_IDS` order so the output is
 * reproducible rather than dependent on sort stability alone.
 */

/**
 * The weights the objective was actually computed with, recovered from the first
 * ten-component block of its breakdown.
 *
 * This matters because the weights are Thompson sampled per request. By the time
 * a traveller opens the panel the profile may have been resampled, and a panel
 * that recomputed from the current profile would show numbers that did not
 * produce the ranking above it. The two penalty weights are not in the component
 * list, so those come from the profile.
 */
function weightsUsedBy(objective: Objective, ctx: DiscoveryContext): Weights {
  const fromProfile = ctx.profile.weights;
  const block = objective.breakdown.components.slice(0, WEIGHT_COMPONENT_KEYS.length);
  if (block.length < WEIGHT_COMPONENT_KEYS.length) return fromProfile;
  const recovered: Weights = { ...fromProfile };
  for (const entry of block) recovered[entry.id] = entry.weight;
  return recovered;
}

function contextWithWeights(ctx: DiscoveryContext, weights: Weights): DiscoveryContext {
  return { ...ctx, profile: { ...ctx.profile, weights } };
}

function byMagnitude(components: readonly ScoreComponent[]): ScoreComponent[] {
  return components
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const delta = Math.abs(b.entry.contribution) - Math.abs(a.entry.contribution);
      if (delta !== 0) return delta;
      return a.index - b.index;
    })
    .map((wrapped) => wrapped.entry);
}

/**
 * The ten components for one stop, sorted by descending absolute contribution.
 *
 * `position` is `{ index: 0, prior: [] }`, so `novelty` is scored with nothing
 * planned before it. That is the known ceiling: the frozen signature
 * `explainStop(stop, ctx, objective)` has no way to learn the stop's position,
 * and per-position novelty needs the whole plan. Use `explainPlan` for that.
 * It is exported from this module and is not yet in the engine barrel, so
 * `SESSION/BLOCKERS/4.md` asks session 1 to re-export this stage.
 */
export function explainStop(stop: Stop, ctx: DiscoveryContext, objective: Objective): ScoreComponent[] {
  const explained = contextWithWeights(ctx, weightsUsedBy(objective, ctx));
  return byMagnitude(scoreStop(stop, explained, { index: 0, prior: [] }));
}

/**
 * The same panel for a whole plan, with every stop scored at its real position.
 * This is the version the UI should call; `explainStop` is the single-stop
 * convenience above it.
 */
export function explainPlan(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
  objective: Objective,
): { stop: Stop; components: ScoreComponent[] }[] {
  const explained = contextWithWeights(ctx, weightsUsedBy(objective, ctx));
  const out: { stop: Stop; components: ScoreComponent[] }[] = [];
  for (let i = 0; i < stops.length; i += 1) {
    out.push({
      stop: stops[i],
      components: byMagnitude(scoreStop(stops[i], explained, { index: i, prior: stops.slice(0, i) })),
    });
  }
  return out;
}

/** The ten ids in the order the breakdown stores them. Re-exported so the UI can label columns. */
export const EXPLAINED_COMPONENT_IDS: readonly ComponentId[] = COMPONENT_IDS;
