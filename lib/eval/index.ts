/**
 * Session 10 public surface. The repository barrel (`lib/engine/index.ts`) is the
 * only barrel and belongs to session 1; this is the stage entry point it wires
 * from.
 *
 * `harness` internals (`estimateMatrix`, `runScenario`, `scoreScenario`) are
 * exported because `lib/eval/*.test.ts` asserts on them and because the provider
 * page needs the same travel matrix the eval measured, so the number the eval
 * reported and the number the UI shows cannot drift apart.
 */

export { SCENARIOS, SCENARIO_IDS } from "./scenarios";
export { aggregate, formatReport, runEval, targetsMet, TARGETS } from "./metrics";
export type { EvalRun } from "./metrics";
export {
  availableMinutes,
  estimateMatrix,
  estimateOriginMinutes,
  packAndValidate,
  planMinutes,
  runScenario,
  scoreScenario,
  shortlist,
} from "./harness";
export type { PipelineOutcome } from "./harness";
export { demandActionability, median, unmetDemandFromStream } from "./unmet-demand";
