/**
 * Session 3 public surface. The engine barrel (`lib/engine/index.ts`) re-exports
 * from here and nowhere else in this stage.
 */
export { gate, runChecks, sortRejections, dominantRejection } from "./gate";
export type { GateOptions, GateResult, Check, GatePosition } from "./gate";

export { feasible, feasibilityMeter } from "./feasibility";
export type { FeasibilityMeter } from "./feasibility";

export { reject, abstain, fieldCause } from "./sentence";
export type { RejectOptions, RejectCause } from "./sentence";

export { CHECKS } from "./checks";
export {
  DEFAULT_BUFFER_MINUTES,
  budgetMinutes,
  localClock,
  normaliseWindow,
  defaultWindowFor,
  travelMinutesFor,
} from "./checks/time";
export type { NormalisedWindow } from "./checks/time";
export { hardAccessNeeds } from "./checks/access";
export { duplicateRadiusKm, DEFAULT_DUPLICATE_RADIUS_KM } from "./checks/plan-state";
