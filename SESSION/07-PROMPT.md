# SESSION 7 of 10 — Adaptive Replanning: Intent Preservation and Minimal Swaps

> Copy everything below this line into a new session.

---

You are session 7 of 10 working simultaneously on **ANANTA**, a fit-first local
discovery engine at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

The problem statement says the system must adapt when circumstances change, and
then says the thing that actually matters: **"TravelBuddy should not just say
unavailable, it should preserve the original intent."** Intent preservation is the
architectural centrepiece. You own it.

## Read first

1. `MASTERPLAN.md` sections 3.5 and 4.
2. `SESSION/00-CONTRACTS.md` **completely**. Sections 0, 2, 4 (your signatures) and
   8 are binding.
3. `lib/adapt.ts` (58 lines) and `app/trips/page.tsx:33-37, 94-132`.

## The defect you are replacing

`lib/adapt.ts` is a single-shot substitution suggester, and its entire input
contract is:

```ts
export type AdaptationConstraints = {
  plan: Experience[];        // whatever the CURRENT mutated state is
  catalog: Experience[];
  budget: number;
  availableMinutes: number;
  ...
};
```

**There is no `original`, no baseline, no snapshot, no prior-plan field anywhere in
the type.** The `plan` passed in is `getPlannedExperiences(readPlan(), ...)`, that
is, the live, already-mutated `localStorage` array. So the replanner reacts to the
last state and reasons from there.

The concrete failure: accept replacement A for a closed item, then a second item
closes. The second call sees `[…A]`, the mutated plan, and has no notion of "we
already moved you once". There is no cumulative displacement record and no way to
revert to what the traveller originally wanted.

Three more defects in the same file:

- **No `Swap[]`, no score delta.** The type is a per-closed-item
  `AdaptationSuggestion` with one free-text `detail` and a `candidatesConsidered`
  count. No delta, no numbers in the reason. The traveller is told "Replaces X and
  keeps the plan inside the listed time and budget" without being told by how much
  slack.
- **The greedy fixpoint bug.** `adapt.ts:37-63` loops over closed items and
  evaluates each replacement independently against the *original* `rest` set.
  `planIds` is computed once, which is good, but `rest` is also from the original
  plan. **If two items close at once and each has an individually feasible swap,
  applying both suggestions produces an infeasible plan that was never validated.**
  All four existing tests use exactly one closed item, so nothing catches it.
- **The candidate sort is not a score.** `adapt.ts:48-52` sorts by
  `travelMinutes`, then `totalCost`, then `name`. That is a lexicographic greedy on
  two plan-level aggregates, so a free 40-minute-access walk beats a 1200-rupee
  workshop purely on the first key. No test covers a case where the two orderings
  disagree.

And in the UI, `app/trips/page.tsx:94`:

```ts
setWeatherAlternative(allExperiences.find((item) => item.statusTone !== "amber" && !ids.includes(item.id))?.id ?? null)
```

First match in array order, ignoring location, category, budget, time and the
plan's own area, followed by the copy at `:132` asserting "keeps the rest of the
plan within the current area". Both clauses are false. You are replacing this with
a real replan.

## ALLOWED — you own these files, exclusively

```
lib/engine/replan/context.ts
lib/engine/replan/triggers.ts
lib/engine/replan/swap.ts
lib/engine/replan/minimality.ts
lib/engine/replan/replan.ts
lib/engine/replan/index.ts
lib/engine/replan/*.test.ts
SESSION/BLOCKERS/7.md
```

## FORBIDDEN

```
lib/engine/contracts/**      session 1
lib/engine/retrieve/**       session 2
lib/engine/feasibility/**    session 3
lib/engine/scoring/**        session 4
lib/engine/packing/**        session 5
lib/engine/validation/**     session 6
lib/engine/eval/**           session 10
lib/engine/index.ts          session 1
lib/seed.ts  lib/data/**     session 8 / frozen
app/**  components/**        sessions 9 and 10
lib/adapt.ts  lib/adapt.test.ts   read-only, do not migrate
docs/**  scripts/**  .github/**
package.json  tsconfig.json  .eslintrc.json  vitest.config.ts  next.config.mjs
```

You may import from sessions 2, 3, 4, 5 and 6, all lower-numbered. You may not
import from `eval/` (session 10).

## Task

### 1. `context.ts`

```ts
export function buildContext(input, city): DiscoveryContext;
```

- Deep-freezes `original`. `Object.freeze` recursively, and return a
  `Readonly<DiscoveryContext>` for it if the type allows. A test asserts that
  mutating `ctx.original.availableMinutes` after construction either throws in
  strict mode or has no effect. This is the mechanism the entire session rests on,
  so it gets a real test rather than a comment.
- `original` is a structural copy, not a reference to the same object. A shallow
  copy is not enough: `profile.weights` is a nested object and a shallow copy lets
  a weight edit mutate the original.
- `cloneForMutation(ctx, patch)`: produces a new context whose `original` is the
  **same frozen original**, never a copy of the intermediate. This one function is
  what makes "diff against original, forever" true by construction rather than by
  discipline. Test it: mutate three times in a row, assert `original` is unchanged
  and reference-identical across all three.

### 2. `swap.ts`

```ts
export function diffAgainstOriginal(before: Plan, after: Plan, ctx): Swap[];
```

- Compare `after` against `before` where `before` is the plan as it was at the last
  user-confirmed state, and always report `diffedAgainst: "original"`. The
  `before` argument exists so the caller can supply a plan; the *reason* text and
  the *score delta* must be computed against `ctx.original`, never against
  `before`.
- One `Swap` per removed id and per added id, with `removedId` or `addedId` null on
  the respective side.
- `reason` is a finished sentence naming the constraint that forced the change, with
  the number: *"Sold out. Swapped in an indoor option 2 km closer, keeping the same
  cultural focus."* Pull the constraint name from the `Rejection.code` that caused
  it, via the session 1 code table. Never hand-write constraint names.
- `scoreDelta` is `objective(after) − objective(before)`, negative meaning worse.
  `minutesDelta` likewise. **These must be real numbers, not placeholders.** The
  current code has no delta at all and that is why the feature does not demo.
- Sort swaps by `Math.abs(scoreDelta)` descending, biggest consequence first.

### 3. `minimality.ts`

The demo metric is **median swaps per context change <= 2**. That is a constraint
on your search, not a hope.

- `minimalSwapSet(plan, ctx, candidates, gate)` that searches for the smallest set
  of substitutions that restores feasibility, then among equally small sets picks
  the highest total objective. Enumerate removals of size 1, then size 2, and stop
  at the first size that yields a feasible result. Bound it and document the bound.
- Reuse session 3's `gate()` and session 5's `pack()` for the feasibility and refill
  steps. This is a legitimate cross-stage import; both are lower-numbered.
- **Fix the multi-closure bug here.** `minimalSwapSet` must be evaluated against the
  plan *with all failures removed at once*, not iteratively per failed item. Write
  the test that would have caught the current bug: two items closed simultaneously,
  each with an individually feasible swap, and assert the combined result is
  validated as feasible before being returned.
- `minimality.ts` must return a plan that has been through session 6's `validate()`.
  Returning an unvalidated plan is the bug, not the absence of a fix.

### 4. `triggers.ts`

Six triggers, each a pure `(ctx) => DiscoveryContext` transform plus a
`TriggerSpec` describing the label the UI shows and the one-click control that fires
it.

| Trigger | Transform |
|---|---|
| `rain_started` | `raining: true`, `weatherSeverity: "rain"`. Do **not** mutate the traveller's stated `avoid` list. The intent is preserved; only the world changed. |
| `time_lost` | Subtract from `availableMinutes` and pull in `deadline` if set. |
| `sold_out` | The caller supplies the affected id; set its `availability.soldOutAt` on a copy of the record set. |
| `budget_dropped` | Lower `budgetInr`. |
| `needs_restroom` | Append `"accessible_restroom"` to `accessNeeds`, de-duplicated. |
| `tired` | `pace: "relaxed"` and `idealStops` reduced by one, floored at `minStops`. |

Each returns a context whose `original` is the untouched frozen original. That is
the whole ballgame, so test every single one.

### 5. `replan.ts`

```ts
export function applyTrigger(plan, trigger, ctx, mutate, solve): ReplanResult;
```

- `mutate` produces the new context. `solve` re-solves it. `solve` is injected, so
  your function is testable without the whole pipeline and so you are not
  responsible for wiring sessions 2 to 6 together.
- Re-solve against the **mutated** context, then diff against the plan, then
  validate. If validation fails, walk session 6's ladder and record every `rung`
  walked in `ReplanResult.rungs`.
- Never mutate the input plan. Return a new one. `Object.freeze` the input in a
  test to prove it.
- **The plan is never silently changed.** The masterplan is explicit that normal
  adaptation is always user-controlled. `applyTrigger` returns a *proposal*;
  applying it is session 9's button. Name the return value so nobody mistakes it
  for a mutation: the type is `ReplanResult`, and it contains the proposed plan,
  not an applied one.

### 6. Tests, and they are the deliverable

`replan.test.ts` must cover, at minimum:

1. `buildContext` freezes `original` deeply, and a nested mutation attempt has no
   effect.
2. `cloneForMutation` three times leaves `original` reference-identical.
3. Each of the six triggers produces a context whose `original` is unchanged, with
   an exact-value assertion on the transformed field.
4. `rain_started` does **not** add anything to `profile.avoid`. The traveller did
   not say they hate rain; the weather changed. This is intent preservation and it
   is worth an explicit test.
5. `tired` reduces `idealStops` by exactly one and floors at `minStops`.
6. `diffAgainstOriginal` returns `diffedAgainst: "original"` and computes
   `scoreDelta` against `ctx.original`, proven by a case where the intermediate
   plan differs from both.
7. **The multi-closure test**: two simultaneous failures, each individually
   fixable, and the returned plan validates as feasible.
8. **The minimality test**: a case where a 1-swap solution exists, asserting exactly
   one swap, so the <= 2 metric has teeth.
9. A case where a 1-swap solution does not exist and the minimum is 2, asserting
   exactly 2 and not 3.
10. A case where no feasible plan exists at any size, asserting the result carries
    `rungs` ending at `single_best` and a `reason` on the last swap that says so in
    plain language rather than throwing.
11. Determinism: the same trigger fired twice produces deep-equal `ReplanResult`.

## Constraints

- **Zero new dependencies.**
- **Purity.** No `Date.now()`, no `Math.random()`, no `fetch`. Time comes from
  `ctx.now`, which is a parameter.
- No em dash (U+2014), no emoji. No Mumbai string in `lib/engine/`.
- No `localStorage`. You own pure logic; session 10 owns storage.

## Verification

```
npm ci
npx tsc --noEmit
npm run lint
npx vitest run lib/engine/replan
```

## Definition of done

1. `original` is provably immutable and provably never replaced, with a test for
   each, not a comment.
2. All six triggers implemented and tested with exact-value assertions.
3. `Swap[]` carries real `scoreDelta` and `minutesDelta` numbers, and a test
   asserts a non-zero delta on a case where the objective genuinely changed.
4. The multi-closure test passes. This is the specific bug in the current code.
5. The minimality tests pin both the 1-swap and the 2-swap cases, so the "<= 2
   swaps" demo metric is measured rather than asserted.
6. Every returned plan has been through `validate()`. A test asserts a deliberately
   infeasible proposal is caught and the ladder is walked instead.
7. `lib/adapt.ts` and `lib/adapt.test.ts` are untouched. Note in your blockers file
   that they become dead code once session 9 cuts over, and that the copy at
   `app/trips/page.tsx:132` claiming the alternative "keeps the rest of the plan
   within the current area" must be deleted, because after your change the
   alternative is chosen by the objective rather than by array order.
