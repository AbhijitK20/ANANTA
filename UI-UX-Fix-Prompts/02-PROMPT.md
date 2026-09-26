# SESSION 2 of 10 — Remove the Engine Fork, Then Make Data Drive Depth

> Copy everything below this line into a new session.

---

You are session 2 of 10 in the **spatial UI round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You have the smallest write surface in the round and the most important
consequence. **This session is a deletion, then an addition of consequence.**

## Why you exist

`components/ananta/pipeline.ts` is 1356 lines and contains a **complete second
implementation of the engine**, inside a React component file:

| Duplicate | Line | Canonical |
|---|---|---|
| `tokenize` | 240 | `lib/engine/retrieve/tokenize.ts` |
| `buildIndex` | 247 | `lib/engine/retrieve/index-builder.ts` |
| `retrieve` | 323 | `lib/engine/retrieve/retrieve.ts` |
| `gate` | 409 | `lib/engine/feasibility/gate.ts` |
| `wilsonLowerBound` | 603 | `lib/engine/scoring/wilson.ts` |
| `objectiveFast` | 921 | `lib/engine/scoring/objective-fast.ts` |
| `pack` | 1043 | `lib/engine/packing/pack.ts` |
| `objectiveNaive` | 1163 | `lib/engine/validation/objective-naive.ts` |
| `validate` | 1259 | `lib/engine/validation/validate.ts` |
| `relax` | 1319 | `lib/engine/validation/ladder.ts` |
| `rank` | 1376 | belongs in no view file |

**Three consequences, in severity order.**

1. **The 1e-6 independence guarantee is defeated.** `objectiveFast` at `:921` and
   `objectiveNaive` at `:1163` are two functions in the same 1356-line file, 240
   lines apart, sharing the same helpers. A "second, deliberately naive derivation
   that shares no code with the first" cannot share a file. The drift test now
   measures a function against its own neighbour. **This is the project's single
   credibility anchor and it currently proves nothing.**
2. **The no-model guard does not cover it.** `lib/engine/guard/no-model.test.ts`
   walks `lib/engine/**`. A full engine copy sits outside that boundary, so a model
   call added here would leave CI green.
3. **The numbers on screen are not the numbers the engine produced.** Nine sessions
   are building a spatial design on top of this file, and the spatial design's
   central gimmick, a plan that tilts with drift, is only honest if `drift` came
   from the engine.

**Why it happened.** The previous session 9 started before the engine sessions
landed and, instead of blocking as the contract requires, wrote its own copy. It
looked faster than waiting. It was not reported. Session 1 is writing
`lib/ui-guard/no-engine-fork.test.ts` specifically to make a second fork fail the
build.

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**. RULE 0, section 6 encodings
   4 and 5, and your row in section 10.
2. `lib/engine/index.ts`, the canonical public surface, 12 export lines.
3. `lib/engine/contracts/types.ts` for the shapes.
4. `components/ananta/pipeline.ts` in full. 1356 lines. You need to know which part
   is orchestration and which part is a reimplementation.
5. Every file in `components/ananta/` that imports from `pipeline.ts`.

## ALLOWED — you own these, exclusively

```
components/ananta/pipeline.ts
components/ananta/pipeline-run.ts
components/ananta/pipeline.test.ts
components/ananta/use-ananta.ts
UI-UX-Fix-Prompts/BLOCKERS/2.md
```

`pipeline.ts` is already down to 2,587 bytes, so the previous round's session 2 got
partway. `pipeline-run.ts` (27KB) is the orchestration half that was split out of
it, and `pipeline.test.ts` (7981 bytes) is its test. **Both are yours and both are
currently orphaned, so nobody will touch them unless you claim them.** Check
`pipeline-run.ts` for reimplemented engine functions first: it is the more likely
place for a fork to survive the split.

## FORBIDDEN

```
tailwind.config.ts, app/globals.css, tokens.ts, records.ts, lib/ui-guard/**  session 1
app/layout.tsx, app/page.tsx, app/contact/**, footer.tsx, ui.tsx              session 3
app/explore/**, map.tsx, discovery-search.tsx, travel-options.tsx              session 4
app/trips/**, components/ananta/feasibility-meter.tsx                         session 5
app/experience/**, provenance-badge.tsx, experience-media.tsx, report-button.tsx          session 6
components/ananta/why-this.tsx, why-this-live.tsx, why-not-that.tsx, learning.ts,
  plan-button.tsx, plan-badge.tsx, save-button.tsx, share-button.tsx           session 7
components/ananta/stress-radar.tsx, learned-weights.tsx, app/profile/**, app/saved/**    session 8
components/ananta/replan.ts, replan-proposal.tsx, app/events/**, availability-picker.tsx  session 9
app/provider/**, app/admin/**, app/terms/**, app/privacy/**                   session 10
lib/**   FROZEN, the entire tree
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, vitest.config.ts, docs/**
```

## Task

### Part 1 — The deletion

**Step 1: capture the export surface before you touch anything.**

```bash
grep -rn 'from "@/components/ananta/pipeline"' components/ app/
```

Every name in that list must still exist when you finish, with the same signature.
Nine sessions import from this file **right now**. Breaking an export is the one way
you can genuinely hurt this round.

**Step 2: turn the eleven reimplementations into re-exports.**

```ts
export {
  tokenize, buildIndex, retrieve, gate, wilsonLowerBound,
  objectiveFast, pack, objectiveNaive, validate, relax,
} from "@/lib/engine";
```

Where the local version took different arguments from the engine's, adapt at the
re-export site with a one-line wrapper and a comment naming the difference. **Do not
change the call sites.** Nine sessions own them. `rank` at `:1376` is **deleted
outright**; ranking is a `lib/engine` concern, and if something needs it that is a
blocker.

**Step 3: keep the orchestration, thin it out.**

What stays: `PLAN_BUFFER_MINUTES`, `STREET_FACTOR`, `WALK_MIN_PER_KM`,
`STOP_WORDS`, the formatters `minutesOfDay` / `clockLabel` / `hoursLabel` /
`inrLabel`, `EngineInput` / `todayStamp` / `contextFromInput` / `weightsFor`,
`CATALOGUE_INDEX`, `COMPONENT_LABEL` and `UTILITY_COMPONENTS` re-exported from
`@/components/ananta/tokens`, `StopTotals` / `stopTotals` / `makeTravelOptions` /
`buildStops` / `routeOrder`, the types `GateOptions` / `GateResult` /
`RetrieveFacet` / `RetrieveOptions` / `RetrieveResult` / `SearchIndex` /
`RelaxationOption` / `PackOptions`, and `PipelineRun` / `runPipeline` as **thin
orchestration only**.

**Target: under 250 lines.** Over that, a reimplementation survived. Then split the
run logic out of the vocabulary so orchestration and labels are not the same file,
which is how a 1356-line file happened.

### Part 2 — The addition: give the spatial design real data to read

This is why you exist in a round that is otherwise about CSS. **Depth must be
driven by data, or it is decoration.** Exports the other nine sessions will use:

```ts
/** Per-record depth, from KNOWLEDGE_DEPTH plus the record's own fields. */
export interface DepthReading {
  record: ExperienceV2;
  confidence: Confidence;
  depthClass: string;        // "depth-raised" | "depth-flush" | "depth-recessed"
  shadowClass: string;
  /** How many of the record's fields are verified, of how many. */
  verifiedFields: number;
  totalFields: number;
  /** True when the record is partly known. Never collapse this to verified. */
  mixed: boolean;
  /** Present when a gate rejected this record. */
  rejected: boolean;
  rejections: Rejection[];
}

/** C-01 uncertainty is recession. */
export function depthForRecord(
  record: ExperienceV2,
  rejections: Rejection[] = [],
): DepthReading;

/** C-03 the plan recedes into the future. Stop 1 lifted, each step down. */
export function depthForStop(index: number, total: number): string;

/** C-04 plan integrity is tilt. Returns a CLASS NAME, not a style. */
export function tiltForDrift(drift: number): string;

/** C-05 answer quality is height. */
export function depthForRung(rung: Rung): string;
```

Requirements:

- **`depthForRecord` reads the record's real `confidence` fields and counts them.**
  A record with OSM coordinates and a hash-derived price is `mixed` and must render
  `mixed`, at `depth-flush`, never as `verified` at `depth-raised`. That single rule
  is the difference between a spatial design that encodes honesty and one that
  launders it, and roughly 96% of the catalogue is generated.
- **`depthForStop` must be monotonic and total.** Four stops should span
  `lifted` to `recessed`, about 9px per step. Test both ends and a one-stop plan.
- **`tiltForDrift` returns a class name from the seven static rules** session 1
  writes. **No runtime style computation.** Zero drift is `tilt-by-drift-0`, which
  must be visually flat, because that is the point: at perfect agreement the plan
  does not tilt at all.
- **Do not import `DRIFT_TOLERANCE` and re-derive it.** Import it from the engine.
  A second literal means the stamp and the drift test can disagree about what
  failure is.

### Part 3 — Prove it

```bash
# 1. the fork is gone
grep -c "^function \|^const \|^class " components/ananta/pipeline.ts   # tiny

# 2. the two objective derivations are in different directories
grep -rln "objectiveFast"  lib/engine/
grep -rln "objectiveNaive" lib/engine/     # a different directory

# 3. the drift test still passes against the engine pair
npx vitest run lib/engine/validation/drift lib/engine/validation/independence

# 4. session 1's guard now passes with no exception for your file
npx vitest run lib/ui-guard

# 5. build and view layer are clean
npx tsc --noEmit && npm run lint
```

## Constraints

- **Zero new dependencies.** No motion library, no 3D library.
- **Do not change any export signature the view layer already consumes.**
- No em dash, no emoji. No hard-coded dataset number.
- No inline `style={{ transform: ... }}` anywhere in the depth helpers. **Class
  names only.** Session 1's `spatial-primitives.test.ts` and
  `reduced-motion.test.ts` depend on it, and a runtime style bypasses the
  reduced-motion block entirely.
- You may not edit a test you do not own. If an existing test asserts on a local
  pipeline function that no longer exists, that is a blocker.

## Definition of done

1. `pipeline.ts` is under 250 lines and contains no function that also exists in
   `lib/engine/`.
2. All eleven reimplementations are re-exports, `rank` is gone, and every view-layer
   import still resolves with an unchanged signature.
3. `objectiveFast` and `objectiveNaive` are confirmed in two different directories,
   and `npx vitest run lib/engine/validation` passes.
4. The five depth-reading exports exist, return class names only, and are tested
   with exact values including the zero-drift flat case.
5. A `mixed` record returns `depth-flush` and `mixed: true`, tested.
6. `npx tsc --noEmit`, `npm run lint` and `npx vitest run lib/ui-guard` are green.
7. `git status --short` shows only `pipeline.ts`, `use-ananta.ts`, and any new file
   you created inside `components/ananta/`.
8. Your summary states the before and after line count, the exact preserved export
   list, any signature you adapted and why, and confirmation that the independence
   guarantee is restored.
