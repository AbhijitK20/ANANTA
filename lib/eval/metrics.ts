import type { EvalReport, EvalResult } from "@/lib/engine/contracts";
import { DRIFT_TOLERANCE } from "@/lib/engine/validation";
import { runScenario, scoreScenario } from "./harness";
import { SCENARIOS } from "./scenarios";
import { demandActionability } from "./unmet-demand";
import { unmetDemandFromStream } from "./unmet-demand";
import { anantaRecords } from "@/lib/data/ananta/records";
import type { PipelineOutcome } from "./harness";

/**
 * Aggregation and rendering. A measurement nobody reads is not a measurement, so
 * this module produces a table a human can act on and the numbers the test suite
 * asserts thresholds against.
 */

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;

const median = (values: readonly number[]): number => {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/**
 * The `MASTERPLAN.md` section 9 success table, as code. The thresholds live here
 * so the test suite, the printed report and the README all quote one number.
 */
export const TARGETS = {
  coverage: 0.9,
  meanTimeUtilisation: 0.85,
  medianSwaps: 2,
  medianTravelKmPerStop: 1.8,
  demandActionability: 0.8,
  maxDrift: DRIFT_TOLERANCE,
} as const;

/** Aggregate scenario results into the report, in scenario order. */
export function aggregate(results: readonly EvalResult[]): EvalReport {
  const planned = results.filter((result) => result.producedPlan).length;
  return {
    results: results.slice(),
    aggregate: {
      coverage: results.length === 0 ? 0 : planned / results.length,
      meanSatisfaction: mean(results.map((result) => result.satisfactionRate)),
      maxDrift: results.reduce((worst, result) => Math.max(worst, result.objectiveDrift), 0),
      medianSwaps: median(results.map((result) => result.swaps)),
      medianTravelKmPerStop: median(results.map((result) => result.medianTravelKmPerStop)),
      meanTimeUtilisation: mean(results.map((result) => result.timeUtilisation)),
    },
  };
}

export interface EvalRun {
  report: EvalReport;
  outcomes: PipelineOutcome[];
  /** Provider actionability, measured over the pooled rejection stream. */
  actionability: { actionable: number; total: number; ratio: number | null };
}

/**
 * Run the suite. `scenarios` defaults to the shipped set; a subset is used by
 * the tests that need one failure isolated.
 */
export function runEval(scenarios = SCENARIOS): EvalRun {
  const outcomes = scenarios.map((scenario) => runScenario(scenario));
  const report = aggregate(scenarios.map((scenario, index) => scoreScenario(scenario, outcomes[index] as PipelineOutcome)));

  // The provider feed is measured over the pooled stream, because a provider
  // cares about demand across the city, not per scenario. The whole catalogue is
  // handed over so every id in the pool resolves to its own area.
  const first = outcomes[0];
  const demands = first
    ? unmetDemandFromStream(outcomes.flatMap((outcome) => outcome.stream), anantaRecords, first.ctx)
    : [];
  return { report, outcomes, actionability: demandActionability(demands) };
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const num = (value: number): string => (Math.round(value * 100) / 100).toFixed(2);

/** A fixed-width table. No colour, no emoji, no em dash: it is read in a terminal. */
export function formatReport(run: EvalRun): string {
  const rows: string[] = [];
  rows.push("ANANTA eval report");
  rows.push("=".repeat(96));
  rows.push(
    "Travel times are straight-line haversine x a published average speed x the city manifest's".padEnd(96),
  );
  rows.push("congestion multiplier. No network, no model, no randomness. Byte reproducible.".padEnd(96));
  rows.push("");

  const header = [
    "scenario".padEnd(24),
    "plan".padEnd(5),
    "rung".padEnd(15),
    "satis".padEnd(7),
    "util".padEnd(7),
    "km/stop".padEnd(8),
    "drift".padEnd(10),
    "swaps".padEnd(6),
  ].join("");
  rows.push(header);
  rows.push("-".repeat(header.length));

  for (const result of run.report.results) {
    rows.push(
      result.scenarioId.slice(0, 24).padEnd(24) +
        (result.producedPlan ? "yes" : "NO").padEnd(5) +
        (result.rung ?? "-").padEnd(15) +
        pct(result.satisfactionRate).padEnd(7) +
        pct(result.timeUtilisation).padEnd(7) +
        num(result.medianTravelKmPerStop).padEnd(8) +
        result.objectiveDrift.toExponential(1).padEnd(10) +
        String(result.swaps).padEnd(6),
    );
  }

  rows.push("-".repeat(header.length));
  const a = run.report.aggregate;
  rows.push("AGGREGATE");
  rows.push(`  coverage                 ${pct(a.coverage).padStart(8)}   target >= ${pct(TARGETS.coverage)}`);
  rows.push(`  mean satisfaction        ${pct(a.meanSatisfaction).padStart(8)}   target 100% by construction`);
  rows.push(`  mean time utilisation    ${pct(a.meanTimeUtilisation).padStart(8)}   target >  ${pct(TARGETS.meanTimeUtilisation)}`);
  rows.push(`  median travel per stop   ${num(a.medianTravelKmPerStop).padStart(7)} km  target <  ${TARGETS.medianTravelKmPerStop} km`);
  rows.push(`  median swaps per change  ${num(a.medianSwaps).padStart(8)}   target <= ${TARGETS.medianSwaps}`);
  rows.push(`  max objective drift      ${a.maxDrift.toExponential(1).padStart(8)}   target <= ${DRIFT_TOLERANCE.toExponential(1)}`);
  rows.push(
    `  unmet-demand actionable  ${(run.actionability.ratio === null ? "n/a" : pct(run.actionability.ratio)).padStart(8)}   target >= ${pct(TARGETS.demandActionability)}  (${run.actionability.actionable}/${run.actionability.total})`,
  );
  rows.push("");

  const missed = run.report.results.filter((result) => !result.producedPlan);
  if (missed.length) {
    rows.push("Scenarios that produced no plan:");
    for (const result of missed) {
      const outcome = run.outcomes[run.report.results.indexOf(result)];
      rows.push(`  ${result.scenarioId}: ${(outcome?.notes ?? []).join(" ") || "no note recorded"}`);
    }
    rows.push("");
  }

  const constraints = run.report.results.reduce((total, result) => total + result.hardConstraints, 0);
  const satisfied = run.report.results.reduce((total, result) => total + result.satisfiedConstraints, 0);
  rows.push(`Hard constraints checked: ${satisfied}/${constraints} satisfied.`);
  rows.push(`Rejections seen: ${run.report.results.reduce((total, r) => total + r.rejections.reduce((n, x) => n + x.count, 0), 0)} blocking, across ${new Set(run.report.results.flatMap((r) => r.rejections.map((x) => x.code))).size} distinct codes.`);
  return rows.join("\n");
}

/** True when every section 9 target holds. Used by the runner and the tests. */
export function targetsMet(run: EvalRun): { met: boolean; failures: string[] } {
  const a = run.report.aggregate;
  const failures: string[] = [];
  const check = (ok: boolean, message: string): void => {
    if (!ok) failures.push(message);
  };
  check(a.coverage >= TARGETS.coverage, `coverage is ${pct(a.coverage)}, target is >= ${pct(TARGETS.coverage)}`);
  check(
    a.maxDrift <= TARGETS.maxDrift,
    `max objective drift is ${a.maxDrift.toExponential(2)}, target is <= ${TARGETS.maxDrift.toExponential(1)}`,
  );
  check(
    a.meanTimeUtilisation > TARGETS.meanTimeUtilisation,
    `mean time utilisation is ${pct(a.meanTimeUtilisation)}, target is > ${pct(TARGETS.meanTimeUtilisation)}`,
  );
  check(
    a.medianSwaps <= TARGETS.medianSwaps,
    `median swaps per context change is ${num(a.medianSwaps)}, target is <= ${TARGETS.medianSwaps}`,
  );
  check(
    a.medianTravelKmPerStop < TARGETS.medianTravelKmPerStop,
    `median travel per stop is ${num(a.medianTravelKmPerStop)} km, target is < ${TARGETS.medianTravelKmPerStop} km`,
  );
  if (run.actionability.ratio !== null) {
    check(
      run.actionability.ratio >= TARGETS.demandActionability,
      `unmet-demand actionability is ${pct(run.actionability.ratio)}, target is >= ${pct(TARGETS.demandActionability)}`,
    );
  }
  const unsatisfied = run.report.results.filter((result) => result.satisfactionRate < 1);
  check(
    unsatisfied.length === 0,
    `${unsatisfied.length} scenario(s) violated a hard constraint: ${unsatisfied.map((r) => r.scenarioId).join(", ")}`,
  );
  return { met: failures.length === 0, failures };
}
