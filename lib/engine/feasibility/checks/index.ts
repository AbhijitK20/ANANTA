import type { DiscoveryContext, ExperienceV2, Rejection } from "@/lib/engine/contracts";
import { checkAccess } from "./access";
import { checkAvailability } from "./availability";
import { checkCapacity } from "./capacity";
import { checkDiet } from "./diet";
import { checkHours } from "./hours";
import { checkIso } from "./iso";
import { checkMoney } from "./money";
import { checkPlanState } from "./plan-state";
import { checkSeason } from "./season";
import { checkTime } from "./time";
import { checkWeather } from "./weather";

/** One concern, one file, one shape. */
export type Check = (
  record: ExperienceV2,
  ctx: DiscoveryContext,
  position: GatePosition,
) => Rejection[];

/** Everything a check may read that is not on the record or the context. */
export interface GatePosition {
  /** Injected travel time with the manifest's congestion multiplier applied. */
  travelMinutes: number;
  /** Minutes from `ctx.now` until the visit window opens. */
  startOffsetMin: number;
  /** Normalised visit window, minutes from local midnight. */
  window: { startMin: number; endMin: number };
  /** Weekday of the window's first minute, 0 = Sunday. */
  weekday: number;
  /** Month of the window, 1..12, in the manifest's timezone. */
  month: number;
  /** Stops already in the plan. Live array; checks must not mutate it. */
  planned: { id: string; coordinates: [number, number] }[];
}

/**
 * Cheapest first, in the order the masterplan states. A reader can see the cost
 * ladder in one screen: presence in the record, arithmetic, then the checks
 * that need the city's own numbers.
 */
export const CHECKS: readonly Check[] = [
  checkIso,
  checkTime,
  checkHours,
  checkMoney,
  checkCapacity,
  checkAccess,
  checkDiet,
  checkAvailability,
  checkWeather,
  checkPlanState,
  checkSeason,
];
