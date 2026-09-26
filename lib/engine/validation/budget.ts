import type {
  DiscoveryContext,
  Stop,
  ValidationIssue,
} from "@/lib/engine/contracts/types";
import { arrivalOffsetMinutes } from "./window";

/**
 * The money, capacity and lead-time half of the independent feasibility
 * re-derivation.
 *
 * Costs come from `record.priceInr`, the numeric field. They are never parsed
 * out of a display string. `lib/plan.ts:30` strips every non-digit and turns
 * "From 300" into 300, which is how a listed range became a hard number; that
 * behaviour is not reproduced here on purpose.
 */

export function partyCostInr(priceInr: number, partySize: number): number {
  return priceInr * Math.max(1, partySize);
}

export function planCostInr(stops: readonly Stop[], partySize: number): number {
  let total = 0;
  for (const stop of stops) total += partyCostInr(stop.record.priceInr, partySize);
  return total;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Total party cost against `ctx.budgetInr`. The per-head figure is in the
 * sentence because it is the one a traveller actually compares against.
 */
export function checkBudget(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
): ValidationIssue[] {
  const total = planCostInr(stops, ctx.partySize);
  const over = rounded(total - ctx.budgetInr);
  if (over <= 0) return [];
  const perHead = Math.round(total / Math.max(1, ctx.partySize));
  return [
    {
      code: "over_budget",
      sentence: `The plan costs ${Math.round(total)} INR for ${
        ctx.partySize
      } travellers, ${Math.round(over)} INR over the ${Math.round(
        ctx.budgetInr,
      )} INR budget, ${perHead} INR per head.`,
      offendingId: null,
    },
  ];
}

/**
 * Capacity against the party size. A `null` capacity means unknown, and an
 * unknown fact never fails a check here; that is the gate's `unverified`
 * business, not this file's.
 */
export function checkCapacity(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const stop of stops) {
    const capacity = stop.record.capacity;
    if (capacity === null || capacity >= ctx.partySize) continue;
    issues.push({
      code: "capacity_exceeded",
      sentence: `${stop.record.name} takes ${capacity} at a time and the party is ${
        ctx.partySize
      }, ${ctx.partySize - capacity} over.`,
      offendingId: stop.record.id,
    });
  }
  return issues;
}

/**
 * Booking lead time against how long the plan takes to reach each stop. A stop
 * that needs more notice than there is before arrival is not a stop the
 * traveller can actually take.
 */
export function checkLeadTime(stops: readonly Stop[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < stops.length; i += 1) {
    const stop = stops[i];
    const lead = stop.record.availability.leadTimeMinutes;
    const notice = arrivalOffsetMinutes(stops, i);
    if (lead <= 0 || notice >= lead) continue;
    issues.push({
      code: "lead_time_too_short",
      sentence: `${stop.record.name} needs ${Math.round(
        lead,
      )} min of notice and the plan gives it ${Math.round(notice)} min.`,
      offendingId: stop.record.id,
    });
  }
  return issues;
}
