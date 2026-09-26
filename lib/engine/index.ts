/**
 * The single public surface of the engine.
 *
 * Rule: UI imports from `@/lib/engine` and never reaches into a stage
 * directory. One indirection, one owner, session 1.
 *
 * The stage re-exports below are commented out on purpose. The stage modules
 * do not exist yet and nine other sessions are writing them right now. Creating
 * placeholder stage files to make this compile would collide with all nine.
 * Uncomment a line when its owner lands the file, and nothing else in the
 * repository has to change.
 *
 * Signatures are frozen in `SESSION/00-CONTRACTS.md` section 4. A signature
 * that differs from that document is a blocker for its owner, not an edit here.
 */

/* contracts, live */
export * from "./contracts";

/* ── stage wiring, enable each line when its owner lands the file ────────── */

// session 2, lib/engine/retrieve/index.ts
// export { buildIndex, retrieve, tokenize } from "./retrieve";
// export type { RetrieveOptions, RetrieveResult, SearchIndex } from "./retrieve";

// session 3, lib/engine/feasibility/index.ts
// export { gate, dominantRejection } from "./feasibility";
// export type { GateOptions, GateResult } from "./feasibility";

// session 4, lib/engine/scoring/index.ts
// export { objectiveFast, wilsonLowerBound, PRIOR_WEIGHTS, sampleWeights, updateBandit, explainStop } from "./scoring";

// session 5, lib/engine/packing/index.ts
// export { pack, buildStops } from "./packing";
// export type { PackOptions } from "./packing";

// session 6, lib/engine/validation/index.ts
// export { objectiveNaive, validate, relax } from "./validation";

// session 7, lib/engine/replan/index.ts
// export { diffAgainstOriginal, applyTrigger, buildContext } from "./replan";

// session 10, lib/engine/eval/index.ts
// export { SCENARIOS, runEval, unmetDemandFromStream } from "./eval";
