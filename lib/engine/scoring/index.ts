/**
 * Session 4 public surface. `lib/engine/index.ts` is the only barrel and belongs
 * to session 1; this is the stage entry point it wires from.
 *
 * Nothing is re-exported from `contracts/`. A stage index that re-exported the
 * frozen types would collide with every other stage's re-export in the main
 * barrel, and one indirection should have exactly one owner.
 */

export { clamp01, clampSigned, isFiniteNumber, normaliseBySum, safeDiv } from "./normalize";

export { STAR_SCALE, WILSON_Z, wilsonLowerBound } from "./wilson";

export {
  COMPONENT_IDS,
  COMPONENTS,
  authenticityComponent,
  crowdComponent,
  groupFitComponent,
  interestComponent,
  localMinutesOfDay,
  noveltyComponent,
  peakHourFactor,
  ratingComponent,
  reliabilityComponent,
  scoreStop,
  travelFrictionComponent,
  valueComponent,
  weatherComponent,
} from "./components";
export type { ComponentFn, StopPosition } from "./components";

export {
  DEFAULT_WEIGHT_PRIOR_STRENGTH,
  PRIOR_WEIGHTS,
  WEIGHT_COMPONENT_KEYS,
  WEIGHT_KEYS,
  clampWeights,
  diffWeights,
} from "./weights";
export type { WeightKey } from "./weights";

export { REWARD, banditFromWeights, sampleWeights, updateBandit } from "./thompson";

export {
  TRAVEL_KM_SCALE,
  crowdLoad,
  objectiveFast,
  paceDeviation,
  planProximity,
  proximityDecay,
  redundancyPenalty,
  superlinearTravel,
} from "./objective-fast";

export { EXPLAINED_COMPONENT_IDS, explainPlan, explainStop } from "./explain";
