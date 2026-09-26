import type { DiscoveryContext, ExperienceV2, Stop } from "@/lib/engine/contracts";
import { DEFAULT_BUFFER_MINUTES, budgetMinutes, defaultWindowFor } from "./checks/time";
import { gate } from "./gate";
import type { GateResult } from "./gate";

/**
 * The two conveniences a caller reaches for: run the gate once, and describe
 * how much of the day a plan has already spent.
 */

/** The one-shot case. Default windows: arrive as soon as travel allows. */
export function feasible(records: ExperienceV2[], ctx: DiscoveryContext): GateResult {
  return gate(records, ctx, { windowFor: defaultWindowFor(ctx) });
}

export interface FeasibilityMeter {
  activityMin: number;
  travelMin: number;
  bufferMin: number;
  usedMin: number;
  remainingMin: number;
  overflow: number;
}

/**
 * Time accounting for a plan, on exactly the same basis the gate checks, so
 * the number on screen and the number the gate used cannot disagree.
 * The buffer is per plan, not per stop: zero stops means zero buffer.
 */
export function feasibilityMeter(stops: Stop[], ctx: DiscoveryContext): FeasibilityMeter {
  const activityMin = stops.reduce((sum, stop) => sum + stop.visitMinutes, 0);
  const travelMin = stops.reduce((sum, stop) => sum + stop.travelMinutes, 0);
  const bufferMin = stops.length ? DEFAULT_BUFFER_MINUTES : 0;
  const usedMin = activityMin + travelMin + bufferMin;
  const budget = budgetMinutes(ctx);
  return {
    activityMin,
    travelMin,
    bufferMin,
    usedMin,
    remainingMin: Math.max(0, budget - usedMin),
    overflow: Math.max(0, usedMin - budget),
  };
}
