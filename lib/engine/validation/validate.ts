import type {
  DiscoveryContext,
  Objective,
  Stop,
  ValidationIssue,
  ValidationResult,
} from "@/lib/engine/contracts/types";
import { checkBudget, checkCapacity, checkLeadTime } from "./budget";
import { DRIFT_TOLERANCE, compareDrift, describeDrift } from "./drift";
import { objectiveNaive } from "./objective-naive";
import {
  checkConditions,
  checkDeadline,
  checkOpeningHours,
  checkOverlap,
  checkTimeBudget,
} from "./window";

/**
 * The credibility anchor.
 *
 * `MASTERPLAN.md` section 9, second row: objective agreement, fast against
 * naive, drift at most 1e-6. This file produces the number that row is
 * measured by, and `satisfiedFraction` is the number the first row is measured
 * by. Both are derived, neither is asserted.
 */

export { DRIFT_TOLERANCE };

export interface HardCheck {
  /** The constraint, in the vocabulary the masterplan uses. */
  name: string;
  /** False when the context does not impose this constraint at all. */
  imposed: boolean;
  satisfied: boolean;
  issues: ValidationIssue[];
}

/**
 * The hard constraints, one entry each, every one tied to the `ctx` field that
 * imposes it. A constraint the context does not impose is not counted, which is
 * what stops `satisfiedFraction` from being a flattering 1.
 *
 * The minimum-stop count appears here but deliberately emits no
 * `ValidationIssue`. It is a count, not a measured shortfall, and
 * `ValidationIssue` has no code for it; inventing one would put a sentence
 * under a code that says something else. `name` is the diagnosis. Logged in
 * SESSION/BLOCKERS/6.md.
 */
export function hardChecks(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
): HardCheck[] {
  const has = <T>(items: readonly T[]): boolean => items.length > 0;
  const time = checkTimeBudget(stops, ctx);
  const deadline = checkDeadline(stops, ctx);
  const overlap = checkOverlap(stops);
  const hours = checkOpeningHours(stops, ctx);
  const conditions = checkConditions(stops, ctx);
  const budget = checkBudget(stops, ctx);
  const capacity = checkCapacity(stops, ctx);
  const lead = checkLeadTime(stops);
  const excluded = stops.filter(
    (stop) => ctx.profile.excludes.indexOf(stop.record.id) !== -1,
  );
  const unmetAccess = stops.filter(
    (stop) =>
      ctx.accessNeeds.some((need) => stop.record.access[need] === false),
  );
  const unmetDiet = stops.filter(
    (stop) => ctx.diets.some((diet) => stop.record.diets.indexOf(diet) === -1),
  );

  return [
    {
      name: "non-empty plan",
      imposed: true,
      satisfied: stops.length > 0,
      issues:
        stops.length > 0
          ? []
          : [
              {
                code: "empty_plan",
                sentence: "No stops to check, so there is nothing to validate.",
                offendingId: null,
              },
            ],
    },
    {
      name: "time window",
      imposed: true,
      satisfied: time.length === 0 && overlap.length === 0,
      issues: [...time, ...overlap],
    },
    {
      name: "deadline",
      imposed: ctx.deadline !== null,
      satisfied: deadline.length === 0,
      issues: deadline,
    },
    {
      name: "budget",
      imposed: true,
      satisfied: budget.length === 0,
      issues: budget,
    },
    {
      name: "availability",
      imposed: true,
      satisfied: conditions.length === 0 && lead.length === 0,
      issues: [...conditions, ...lead],
    },
    {
      name: "opening hours",
      imposed: true,
      satisfied: hours.length === 0,
      issues: hours,
    },
    {
      name: "capacity",
      imposed: true,
      satisfied: capacity.length === 0,
      issues: capacity,
    },
    {
      name: "minimum stops",
      imposed: ctx.minStops >= 1,
      satisfied: stops.length >= ctx.minStops,
      issues: [],
    },
    {
      name: "accessibility needs",
      imposed: has(ctx.accessNeeds),
      satisfied: unmetAccess.length === 0,
      issues: unmetAccess.map((stop) => {
        const missing = unmetNeeds(ctx.accessNeeds, stop);
        return {
          code: missing.length === 0 ? "requires_steps" : ACCESS_CODE[missing[0]],
          sentence: `${stop.record.name} does not offer ${missing
            .map((need) => need.replace(/_/g, " "))
            .join(", ")}.`,
          offendingId: stop.record.id,
        };
      }),
    },
    {
      name: "dietary needs",
      imposed: has(ctx.diets),
      satisfied: unmetDiet.length === 0,
      issues: unmetDiet.map((stop) => ({
        code: "diet_mismatch" as const,
        sentence: `${stop.record.name} does not list ${unmetDietFor(stop, ctx)}.`,
        offendingId: stop.record.id,
      })),
    },
    {
      name: "traveller exclusions",
      imposed: has(ctx.profile.excludes),
      satisfied: excluded.length === 0,
      issues: excluded.map((stop) => ({
        code: "excluded_by_traveller" as const,
        sentence: `${stop.record.name} is on the traveller's excluded list.`,
        offendingId: stop.record.id,
      })),
    },
  ];
}

function unmetNeeds(
  needs: DiscoveryContext["accessNeeds"],
  stop: Stop,
): DiscoveryContext["accessNeeds"] {
  return needs.filter((need) => stop.record.access[need] === false);
}

/**
 * Which `RejectionCode` names a given unmet access need. Seven needs, six codes,
 * so `service_animal_ok` borrows the closest one. The sentence always names the
 * real need, so the code is a bucket and the prose is the truth.
 * ponytail: `low_walking` mapped to `requires_steps` is a guess. Upgrade path
 * is one more code in `contracts/codes.ts`.
 */
const ACCESS_CODE: Record<string, ValidationIssue["code"]> = {
  step_free: "not_step_free",
  stroller_ok: "not_stroller_ok",
  accessible_restroom: "no_accessible_restroom",
  seating_available: "no_seating",
  quiet_space: "not_quiet_enough",
  low_walking: "requires_steps",
  service_animal_ok: "not_step_free",
};

function unmetDietFor(stop: Stop, ctx: DiscoveryContext): string {
  return ctx.diets
    .filter((diet) => stop.record.diets.indexOf(diet) === -1)
    .join(", ");
}

/**
 * Validate a plan against the independent re-derivation.
 *
 * `fast` is the producer's objective. It is compared, never trusted, and read
 * for nothing except the drift figure. Nothing the producer says can suppress
 * an issue here, because the producer does not write this file.
 */
export function validate(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
  fast: Objective,
): ValidationResult {
  const naive = objectiveNaive(stops, ctx);
  const comparison = compareDrift(fast, naive);
  const checks = hardChecks(stops, ctx);
  const issues: ValidationIssue[] = [];
  for (const check of checks) issues.push(...check.issues);

  if (comparison.drift > DRIFT_TOLERANCE) {
    issues.push({
      code: "objective_drift",
      sentence: describeDrift(comparison),
      offendingId: null,
    });
  }

  // Purity sanity. A non-finite scalar means a normalisation divided by zero or
  // read an absent field as a number, and every comparison against NaN is
  // false, so a NaN would sail straight through a drift check that only tests
  // `<=`.
  const again = objectiveNaive(stops, ctx);
  if (again.value !== naive.value) {
    issues.push({
      code: "objective_drift",
      sentence: `The naive objective is not deterministic: ${naive.value} then ${again.value} on the same input.`,
      offendingId: null,
    });
  }
  if (!Number.isFinite(naive.value) || !Number.isFinite(fast.value)) {
    issues.push({
      code: "objective_drift",
      sentence: `A non-finite objective cannot be compared: fast ${String(
        fast.value,
      )}, naive ${String(naive.value)}.`,
      offendingId: null,
    });
  }

  const imposed = checks.filter((check) => check.imposed);
  const satisfied = imposed.filter((check) => check.satisfied).length;
  const allSatisfied = imposed.length > 0 && satisfied === imposed.length;

  return {
    ok:
      issues.length === 0 &&
      comparison.drift <= DRIFT_TOLERANCE &&
      allSatisfied,
    drift: comparison.drift,
    issues,
    satisfiedFraction: imposed.length === 0 ? 1 : satisfied / imposed.length,
  };
}
