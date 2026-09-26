# SESSION 2 of 10 — Remove the Engine Fork from the View Layer

> Copy everything below this line into a new session.

---

You are session 2 of 10 in the **UI/UX fix round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You have the most surgical job in the round and the most important consequence.
**This session is a deletion, not a build.**

## Why you exist

`components/ananta/pipeline.ts` is 1356 lines and contains a **complete second
implementation of the engine**, inside a React component file:

| Duplicate | Line | Canonical owner |
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
| `rank` | 1376 | belongs in no view file at all |

It imports only a type block at `:20-21` plus `COMPONENT_IDS`, `getCityManifest` and
`rejectionSentence`.

**Three consequences, in order of severity.**

1. **The 1e-6 independence guarantee is defeated.** `objectiveFast` at `:921` and
   `objectiveNaive` at `:1163` are now two functions in the same 1356-line file,
   240 lines apart, sharing the same surrounding helpers. A "second, deliberately
   naive derivation that shares no code with the first" cannot share a file. The
   drift test now measures a function against its own neighbour. **This is the
   project's single credibility anchor and it currently proves nothing.**
2. **The no-model guard does not cover it.** `lib/engine/guard/no-model.test.ts`
   walks `lib/engine/**`. An entire engine copy sits outside that boundary, so a
   model call added here would leave CI green.
3. **The numbers on screen are not the numbers the engine produced.** Nine other
   sessions are about to build UI on top of this file.

**Why it happened, because it is the lesson.** The previous session 9 started before
the engine sessions landed and, instead of blocking as the contract required, wrote
its own copy. It looked faster than waiting. It was not reported in
`SESSION/BLOCKERS/`. Session 1 of this round is writing
`lib/ui-guard/no-engine-fork.test.ts` specifically to make a second fork fail the
build. **You are the reason that test can be live for every file except yours.**

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**, especially RULE 0 and your
   ownership row in section 6.
2. `lib/engine/index.ts` — the canonical public surface, 12 export lines.
3. `lib/engine/contracts/types.ts` — the shapes you will re-export.
4. `components/ananta/pipeline.ts` in full. 1356 lines. You need to know what is
   orchestration and what is a reimplementation.
5. Every file in `components/ananta/` that imports from `pipeline.ts`, so you know
   the exact export list to preserve.

## ALLOWED — you own these, exclusively

```
components/ananta/pipeline.ts
components/ananta/use-ananta.ts
UI-UX-Fix-Prompts/BLOCKERS/2.md
```

Two files. That is the whole surface, and that is deliberate: the smaller this
session's write set, the less chance of a collision.

## FORBIDDEN

```
components/ananta/tokens.ts, records.ts      session 1
tailwind.config.ts, app/globals.css          session 1
app/layout.tsx, app/page.tsx, app/contact/**, components/footer.tsx, components/ui.tsx   session 3
app/explore/**, components/map.tsx, discovery-search.tsx, travel-options.tsx   session 4
app/trips/**, components/ananta/feasibility-meter.tsx                        session 5
app/experience/**, provenance-badge.tsx, experience-media.tsx, report-button.tsx          session 6
components/ananta/why-this.tsx, why-this-live.tsx, why-not-that.tsx, learning.ts,
  plan-button.tsx, plan-badge.tsx, save-button.tsx, share-button.tsx          session 7
components/ananta/stress-radar.tsx, learned-weights.tsx, app/profile/**, app/saved/**       session 8
components/ananta/replan.ts, replan-proposal.tsx, app/events/**, availability-picker.tsx   session 9
app/provider/**, app/admin/**, app/terms/**, app/privacy/**                 session 10
lib/**  (the entire tree, including lib/engine and lib/ui-guard)            FROZEN
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, docs/**
```

**You cannot fix the engine, the guard tests, or anything else.** If the engine is
missing something you need, that is a blocker, not an edit.

## Task

### Step 1 — Establish the exact export surface before you delete anything

```bash
# what the view layer currently consumes
grep -rn "from \"@/components/ananta/pipeline\"" components/ app/
```

Write that list down. Every name in it must still exist when you finish, with the
same signature. Nine sessions are importing from this file **right now** and will
not re-check. Breaking an export is the one way you can genuinely hurt this round.

### Step 2 — Delete the eleven reimplementations

Each becomes a re-export from `@/lib/engine`:

```ts
export {
  tokenize, buildIndex, retrieve, gate, wilsonLowerBound,
  objectiveFast, pack, objectiveNaive, validate, relax,
} from "@/lib/engine";
```

**Signatures must match what the view layer already calls.** Where the local version
took different arguments from the engine's, adapt at the re-export site with a
one-line wrapper and a comment naming the difference. Do not change the call sites,
nine sessions own them.

`rank` at `:1376` gets **deleted outright**. Ranking is a `lib/engine` concern. If
something genuinely needs it, it is a blocker for a `lib/engine/scoring` export.

### Step 3 — Keep the orchestration, thin it out

This is what `pipeline.ts` should become:

- **Constants and vocabulary:** `PLAN_BUFFER_MINUTES`, `STREET_FACTOR`,
  `WALK_MIN_PER_KM`, `STOP_WORDS`.
- **Formatters:** `minutesOfDay`, `clockLabel`, `hoursLabel`, `inrLabel`.
- **Context construction:** `EngineInput`, `todayStamp`, `contextFromInput`,
  `weightsFor`, `DEMO_ORIGIN` if it lives here.
- **Index handle:** `CATALOGUE_INDEX`.
- **Labels:** `COMPONENT_LABEL`, `UTILITY_COMPONENTS` — re-export from
  `@/components/ananta/tokens` where session 1 has landed them, with a comment
  noting the move, since session 1 is the owner.
- **Stop helpers:** `StopTotals`, `stopTotals`, `makeTravelOptions`, `buildStops`,
  `routeOrder`.
- **Types:** `GateOptions`, `GateResult`, `RetrieveFacet`, `RetrieveOptions`,
  `RetrieveResult`, `SearchIndex`, `RelaxationOption`, `PackOptions`.
- **The run function:** `PipelineRun`, `runPipeline` as **thin orchestration only**.
  It may call the engine's stages in order. It may not reimplement any of them.

**Target: under 250 lines.** If you are over, something reimplementation survived.

Then **split** it. Orchestration and vocabulary in different files is the whole
point, and the cleanest split is to leave `pipeline.ts` as the re-export surface
everybody already imports, and move the run logic into a file you create inside
`components/ananta/`. Name it after what it does, not after a session.

### Step 4 — `use-ananta.ts`

86 lines, holds `DEMO_ORIGIN` and the hook that drives the pipeline. Keep it a thin
wrapper over the run function. It must not import anything from `lib/engine` that
the run function does not already re-export, or you have recreated the coupling you
just removed.

### Step 5 — Prove it

The most important test you write, and it is not a unit test:

```bash
# 1. the fork is gone from your file
grep -c "^function \|^const \|^class " components/ananta/pipeline.ts   # should be tiny

# 2. objectiveFast and objectiveNaive now live in different files
grep -rln "objectiveFast" lib/engine/ | head
grep -rln "objectiveNaive" lib/engine/ | head
# two different directories, no overlap

# 3. the drift test still passes against the engine pair, not a local pair
npx vitest run lib/engine/validation/drift lib/engine/validation/independence

# 4. the build is clean
npx tsc --noEmit
npm run lint
```

Then confirm session 1's guard: `npx vitest run lib/ui-guard` should now pass
`no-engine-fork` **with no exception for your file**. If it still needs an
exception, the fork is not fully gone. Tell session 1 by appending to
`BLOCKERS/1.md`? No, that is not yours. Say so in your own summary and session 1
will see it. Actually: append a line to `BLOCKERS/1.md` is **not allowed**. Put it
in your own `BLOCKERS/2.md` with severity `blocker` and name session 1 as the owner.

## Constraints

- **Zero new dependencies.**
- **Do not change any export signature that the view layer already consumes.** This
  is the one way to break eight other sessions.
- No em dash (U+2014), no emoji.
- No hard-coded dataset number. Import from `@/components/ananta/records`.
- You may not edit a test you do not own. If an existing test asserts on a local
  pipeline function that no longer exists, that is a blocker, not an edit.

## Definition of done

1. `pipeline.ts` is under 250 lines and contains **no** function, class or algorithm
   that also exists in `lib/engine/`.
2. All eleven reimplementations are re-exports, and `rank` is gone.
3. Every import in `components/` and `app/` of `@/components/ananta/pipeline` still
   resolves, with unchanged signatures.
4. `objectiveFast` and `objectiveNaive` are confirmed to live in two different
   directories under `lib/engine/`, and
   `npx vitest run lib/engine/validation` passes.
5. `npx tsc --noEmit` and `npm run lint` are clean.
6. `git status --short` shows only `pipeline.ts` and any new file you created inside
   `components/ananta/`.
7. Your summary states: the before and after line count, the exact export list you
   preserved, any signature you had to adapt and why, and confirmation that the
   independence guarantee is restored.
