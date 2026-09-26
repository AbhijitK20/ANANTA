# SESSION 6 of 10 — Independent Validation and the Named Relaxation Ladder

> Copy everything below this line into a new session.

---

You are session 6 of 10 working simultaneously on **ANANTA**, a fit-first local
discovery engine at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

**You are the reason anyone should believe the engine.** Everything else in this
project is a claim. You are the check.

## Read first

1. `MASTERPLAN.md` sections 3.4 and 9. The second row of the success criteria table
   is yours.
2. `SESSION/00-CONTRACTS.md` **completely**. Section 3, the objective, is your
   specification. You must implement it a second time, from the same written spec,
   sharing no code with the person who implemented it first.
3. `lib/engine/objective-spec.md` if session 1 has landed it.
4. `lib/plan.ts:39-62` to see the self-consistency you are replacing.

## The defect you are replacing

```ts
// lib/plan.ts:44-60
const hasWeatherWarning = experiences.some((e) => e.statusTone === "amber");
const timeFits = totalMinutes <= availableMinutes;
const budgetFits = totalCost <= budget;
const deadlineFits = ...;
return { ..., feasible: budgetFits && timeFits && deadlineFits };
```

`feasible` is computed from the same locals computed four lines above, and
`generatePlanVariants` at `:75-76` then calls `evaluatePlan` and filters on its own
output. **The producer and the checker are the same function.** That is
self-consistency, not validation. A function that grades its own homework has told
you nothing.

Two more things it gets wrong while you are here:

- `hasWeatherWarning` is computed at `:44` and then **not used** in `feasible` at
  `:60`. So a plan the Explore page refuses to build is "feasible" on the Trips
  page.
- `minutesUntil` at `:101-108` has **zero test coverage** and wraps to tomorrow if
  the time has passed. Time-of-day dependent, untested, and it decides whether a
  deadline is met.

## The independence requirement, stated precisely

This is the heart of your session. Read it twice.

- `objectiveNaive` **must not import anything from `scoring/`, `packing/`, or
  `validation/`.** Not a helper, not a constant, not a normaliser. It imports only
  `contracts/` types and the standard library.
- It **recomputes distances from `coordinates` with its own haversine**, rather than
  reading the precomputed matrix that `objectiveFast` uses. Two derivations that
  share an intermediate are one derivation.
- It is allowed to be slow. It is allowed to be naive. It is allowed to be
  obviously correct. That is the entire design goal. A second implementation that
  is clever is worthless.
- `drift = |objectiveFast.value − objectiveNaive.value|`. `ok` requires
  `drift <= 1e-6` **and** no `ValidationIssue`.
- When they disagree, the failure message must say which component diverged and by
  how much. A drift test that only says "expected 0.1234, got 0.1241" will cost the
  team an hour every time.

## ALLOWED — you own these files, exclusively

```
lib/engine/validation/objective-naive.ts
lib/engine/validation/components-naive.ts
lib/engine/validation/distance-naive.ts
lib/engine/validation/drift.ts
lib/engine/validation/window.ts
lib/engine/validation/budget.ts
lib/engine/validation/ladder.ts
lib/engine/validation/validate.ts
lib/engine/validation/index.ts
lib/engine/validation/*.test.ts
SESSION/BLOCKERS/6.md
```

## FORBIDDEN

```
lib/engine/contracts/**      session 1
lib/engine/retrieve/**       session 2
lib/engine/feasibility/**    session 3
lib/engine/scoring/**        session 4, you may CALL objectiveFast, never import its internals
lib/engine/packing/**        session 5
lib/engine/replan/**         session 7
lib/engine/eval/**           session 10
lib/engine/index.ts          session 1
lib/seed.ts  lib/data/**     session 8 / frozen
app/**  components/**        sessions 9 and 10
lib/plan.ts  lib/plan.test.ts   read-only, do not migrate
docs/**  scripts/**  .github/**
package.json  tsconfig.json  .eslintrc.json  vitest.config.ts  next.config.mjs
```

Reading session 4's source to check your own work is fine and encouraged. Copying
from it is not. If you find yourself matching a variable name, that is a warning.

## Task

### 1. `distance-naive.ts` and `objective-naive.ts`

Implement the formula in `SESSION/00-CONTRACTS.md` section 3 a second time.

- Haversine on `[number, number]` pairs, written from the formula, not imported.
- Every component written inline in one function if that makes it more obviously
  correct. Readability beats structure here, and say so in a comment, because the
  whole value of this file is that a human can audit it in ten minutes.
- The Wilson bound, the quadratic travel term with the 8 km constant, the pair
  redundancy count, the pace deviation exponent. All of it, from the spec.
- Same purity rules: no `Date.now()`, no `Math.random()`, no clock, no
  `Set`-iteration-order dependence, index-ordered accumulation.

Add a comment at the top of the file stating, in one line, that this file
intentionally duplicates `scoring/objective-fast.ts` and must never be "deduplicated"
into it. Someone will try to clean this up one day. Preempt them.

### 2. `drift.ts`

```ts
export function compareDrift(
  fast: Objective,
  naive: Objective,
): { drift: number; perComponent: { id: ComponentId | "aggregate"; fast: number; naive: number; delta: number }[] };
```

- `perComponent` sorted by descending `Math.abs(delta)`, worst first, so the error
  message leads with the culprit.
- A `DRIFT_TOLERANCE = 1e-6` constant, exported, and used by session 10's eval
  harness too. One constant, not two.
- Test: a deliberately corrupted `naive` objective with one component off by 1e-3
  produces a drift above tolerance and a per-component table whose largest delta
  is that component.

### 3. `window.ts` and `budget.ts`

Independent feasibility re-checks, re-derived from `ctx` and the raw records, not
from session 3's `gate()` output. This is the second derivation for the hard
constraints as well as for the objective.

- `window.ts`: assert the stops do not overlap in time, that every visit window
  falls inside an open window, that `Σ (travel + visit + buffer) <= availableMinutes`,
  and that the last `arriveBy` respects `ctx.deadline` when it is set. Returns
  `ValidationIssue[]`.
- Implement your own "minutes until deadline" from `ctx.now` and the deadline
  string. Do not import `lib/plan.ts:101`. The current one wraps to tomorrow and is
  untested; write yours to return a negative value for a past deadline and let the
  caller decide, with a test for the past-deadline case and one for the
  crosses-midnight case.
- `budget.ts`: re-sum `priceInr * partySize` across stops and compare to
  `ctx.budgetInr`. Re-derive `priceInr` from the record's numeric field, never by
  parsing a display string. The current `parsePrice` strips non-digits and turns
  `"From 300"` into `300`; do not reproduce it.
- **Weather and closed checks belong here too.** The current `plan.ts` computes
  `hasWeatherWarning` and forgets to use it. Assert that no stop is
  `sold_out`, and that outdoor stops are not present under
  `weatherSeverity` of `heavy_rain` or `storm`. Under `rain`, outdoor is allowed
  with a warning; under `storm` it is not.

### 4. `ladder.ts`

The named relaxation ladder. `MASTERPLAN.md` section 3.4:

```
strict → dropped_minimum → greedy_fill → single_best
```

```ts
export function relax(stops, ctx, cause): { stops: Stop[]; rung: Rung; note: string } | null;
```

- `strict`: the plan as given. No change.
- `dropped_minimum`: the requested `minStops` cannot be met, so reduce to the
  largest feasible count below it. The note must say which, with the number:
  *"Relaxed: minimum 1 stop instead of 2."*
- `greedy_fill`: keep the feasible core, then add back the highest-scoring
  candidates that still pass every hard check. The note must name how many were
  added and what was given up.
- `single_best`: one stop, the best feasible. The note must say so plainly.
- Each rung returns `null` if it cannot produce anything feasible, and the caller
  walks down. Returning `null` is a normal outcome, not an error.
- **Every rung returns a `note` in the traveller's language, naming the number that
  changed.** "Relaxed: minimum 1 stop instead of 2" is a far better demo than an
  unsat core, and unlike an unsat core it is honest. No em dash.
- You must not import session 3's `gate()`. Re-derive feasibility with your own
  `window.ts` and `budget.ts` checks. Two independent feasibility paths is the
  point; a shared one is a single point of failure wearing a lab coat.
- You may import session 5's `pack()` for the refill step, since it is a
  constructor rather than a checker. Say in a comment why that asymmetry is
  acceptable.

### 5. `validate.ts`

```ts
export function validate(stops, ctx, fast): ValidationResult;
```

- Runs the drift check, the window check, the budget check, the availability and
  weather checks, and the objective-purity sanity check.
- `satisfiedFraction` = satisfied hard constraints divided by total hard
  constraints, derived from the `ctx` fields that actually impose one. This is the
  number the masterplan's "100% by construction" claim is measured against, so it
  must be computed from real constraints and not hard-coded to 1.
- `ok` is `drift <= DRIFT_TOLERANCE && issues.length === 0`.

### 6. The integration test that is the whole point of this repo

`lib/engine/validation/drift.test.ts`:

- Build a synthetic `ExperienceV2[]` of at least 12 records across 3 categories
  with known coordinates, prices, durations and hours.
- Build a `DiscoveryContext` by hand. Do not import session 7's `buildContext`,
  which may not exist yet, and do not rely on session 8's data.
- Call `objectiveFast` and `objectiveNaive` on the same stops. Assert
  `drift <= 1e-6`.
- Then mutate one thing: a price, a duration, a coordinate, a party size, an
  ideal-stop count, a weight. Assert the drift still holds, and assert the mutated
  value actually changed. A test that passes because nothing changed is worse than
  no test.
- Cover the edge cases that break naive implementations: `partySize = 1`,
  `idealStops = 1`, a single-stop plan, a plan where every stop is in one category
  (so `redundancyPenalty` is maximal), a plan where every stop is the same
  `bestTimeOfDay`, and `availableMinutes` exactly equal to the consumed time.
- If session 4's `objectiveFast` does not exist when you run, write this test
  against the frozen signature anyway and report it as blocked in
  `SESSION/BLOCKERS/6.md` with severity `blocker`. **Do not** implement a local copy
  of `objectiveFast` to make your test pass. That would make the drift test
  meaningless, which is the single worst outcome available to you.

## Constraints

- **Zero new dependencies.** No `z3-solver`. The masterplan rules it out explicitly
  and the relaxation ladder is a better demo anyway.
- **Purity**, same rules as session 4, because the drift comparison is meaningless
  if either side can drift between calls.
- No em dash (U+2014), no emoji. No Mumbai string in `lib/engine/`.

## Verification

```
npm ci
npx tsc --noEmit
npm run lint
npx vitest run lib/engine/validation
```

## Definition of done

1. `objective-naive.ts` imports nothing from `scoring/`, `packing/`, or any other
   stage. A test asserts this by reading the import statements out of the file
   source, the same way session 1's guard test does it. **Make that test, it is
   cheap and it is the guarantee.**
2. `drift.test.ts` passes on the synthetic 12-record fixture, and still passes after
   each of the six mutations, with the mutated value asserted to have changed.
3. A test asserts a deliberately corrupted naive objective is caught, and that the
   `perComponent` table names the right component.
4. Each of the four ladder rungs has a test: a fixture that stops at that rung
   returns the right `rung` and a `note` containing the changed number.
5. A test asserts a rung that cannot produce a feasible plan returns `null` rather
   than an invalid plan.
6. Tests for the past-deadline and crosses-midnight cases in your own
   minutes-until implementation.
7. A test asserts an outdoor stop under `storm` is an issue, and under `rain` is
   not, and under `null` weather is not.
8. A test asserts `satisfiedFraction` is strictly between 0 and 1 on a plan with
   exactly one violated hard constraint, so the metric is real.
9. `DRIFT_TOLERANCE` is exported and used everywhere in your files, with no second
   literal.
