/**
 * The public surface of the plan pipeline for the view layer.
 *
 * Nine files import from this path and none of them were re-checked when the
 * engine landed, so every name below keeps the exact signature it had. This
 * file is a re-export surface, not an implementation. The implementation is in
 * `./pipeline-run`, and every number comes from `lib/engine`.
 *
 * What was removed, and why it mattered:
 *
 *   - `tokenize`, `buildIndex`, `retrieve`, `gate`, `wilsonLowerBound`,
 *     `objectiveFast`, `pack`, `objectiveNaive`, `validate`, `relax`: eleven
 *     reimplementations of engine stages, all of which now come from
 *     `lib/engine`.
 *   - `rank`: deleted outright. Ranking is an engine concern; the orchestration
 *     that the results list needs is `rankRows` inside `./pipeline-run` and it
 *     is not exported, because nothing outside this file wanted it.
 *   - `bm25`, `SearchIndex`'s local shape, `RetrieveFacet`, `STOP_WORDS`,
 *     `UTILITY_COMPONENTS`: local-only shapes that the engine's own types
 *     replace outright.
 *
 * What stayed, and why: the four formatters, the three travel constants, the
 * traveller input shape, context construction, the stop helpers and the run
 * function. None of those is engine surface. A twelve hour clock and a rupee
 * symbol are presentation, and `lib/engine` is explicitly not a design system.
 *
 * @see UI-UX-Fix-Prompts/00-CONTRACTS.md RULE 0.
 */

export { COMPONENT_LABEL } from "@/components/ananta/tokens";

export {
  PLAN_BUFFER_MINUTES,
  STREET_FACTOR,
  WALK_MIN_PER_KM,
  minutesOfDay,
  clockLabel,
  hoursLabel,
  inrLabel,
  todayStamp,
  contextFromInput,
  weightsFor,
  CATALOGUE_INDEX,
  catalogueIndex,
  makeTravelOptions,
  buildStops,
  routeOrder,
  probe,
  stopTotals,
  stopComponents,
  objectiveFast,
  objectiveNaive,
  validate,
  relax,
  gate,
  pack,
  cheapestRelaxation,
  runPipeline,
  defaultTestInput,
} from "./pipeline-run";

export type {
  EngineInput,
  PackOptions,
  PipelineRun,
  RankedRow,
  RelaxationOption,
  StopTotals,
} from "./pipeline-run";

/* ── the engine's own stages, re-exported unchanged ─────────────────────── */

export { buildIndex, retrieve, tokenize } from "@/lib/engine/retrieve";
export type { RetrieveOptions, RetrieveResult, SearchIndex } from "@/lib/engine/retrieve";

export { dominantRejection } from "@/lib/engine/feasibility";
export type { GateOptions, GateResult } from "@/lib/engine/feasibility";

export { wilsonLowerBound, explainStop } from "@/lib/engine/scoring";

/* ── depth: the spatial layer's data source ─────────────────────────────── */

export {
  confidenceForRecord,
  depthForRecord,
  depthForRung,
  depthForStop,
  tiltForDrift,
} from "./depth";
export type { DepthReading } from "./depth";
