# SESSION 4 of 10 — Scoring: the Scalar Objective, Wilson Bound, Thompson Weights

> Copy everything below this line into a new session.

---

You are session 4 of 10 working simultaneously on **ANANTA**, a fit-first local
discovery engine at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You own the number the whole product is judged on. Session 6 will independently
re-derive it and the two must agree to `1e-6`. That agreement is the credibility
anchor of the entire project, so the most important thing you can do is make your
implementation **boring, total and pure**.

## Read first

1. `MASTERPLAN.md` sections 3.2, 3.4 and 9.
2. `SESSION/00-CONTRACTS.md` **completely**. Section 3, the objective, is your
   specification. Sections 0, 2, 4 and 8 are binding.
3. `lib/engine/objective-spec.md` if session 1 has landed it. That is the shared
   written spec you and session 6 both code against.
4. `lib/recommendation.ts:53-70`, the entire current scoring model, which is five
   hardcoded integer literals.

## The defect you are replacing

```ts
if (experience.city === constraints.city) { score += 3; }
if (experience.category === ...)         { score += 4; }
score += Math.max(1, 3 - price / Math.max(constraints.maxPrice, 1));
```

Three defects, all of which you must not carry forward:

1. **The score is not comparable across constraint sets.** With `{city, category}`
   the ceiling is 7. With all six constraints it is about 20. A rank of 1 under a
   loose filter is not a rank of 1 under a strict one, so nothing is reproducible.
2. **`Math.max(1, ...)` floors destroy resolution.** A record that just barely
   passes and one that fits in 10% of the budget score identically.
3. **Two components score conditions the gate already proved.** `:55` and `:56`
   award points for `city` and `category` matching, which are hard filters. The
   score double-counts two gates.

Also: `lib/recommendation.ts:62-67` folds in `proximityBonus` and then explicitly
declines to emit a reason for it, with a comment saying so. That is the only scored
component with no explanation, and it violates the repo's own stated rule that every
result stores structured explanation facts. Every component you write emits a
sentence.

## ALLOWED — you own these files, exclusively

```
lib/engine/scoring/components.ts
lib/engine/scoring/wilson.ts
lib/engine/scoring/weights.ts
lib/engine/scoring/thompson.ts
lib/engine/scoring/normalize.ts
lib/engine/scoring/objective-fast.ts
lib/engine/scoring/explain.ts
lib/engine/scoring/index.ts
lib/engine/scoring/*.test.ts
SESSION/BLOCKERS/4.md
```

## FORBIDDEN

```
lib/engine/contracts/**      session 1
lib/engine/retrieve/**       session 2
lib/engine/feasibility/**    session 3
lib/engine/packing/**        session 5
lib/engine/validation/**     session 6
lib/engine/replan/**         session 7
lib/engine/eval/**           session 10
lib/engine/index.ts          session 1
lib/seed.ts  lib/data/**     session 8 / frozen
app/**  components/**        sessions 9 and 10
lib/recommendation.ts        read-only, do not migrate
docs/**  scripts/**  .github/**
package.json  tsconfig.json  .eslintrc.json  vitest.config.ts  next.config.mjs
```

Session 6 is forbidden from importing anything in `scoring/`, and you are
forbidden from importing anything in `validation/`. Neither of you may read the
other's code. The contract file is your only shared channel, which is exactly why
it specifies the formula to the decimal.

## Task

### 1. `wilson.ts`

Wilson score lower bound at 95% confidence, `z = 1.96`:

```
lower = (p̂ + z²/2n − z·sqrt((p̂(1−p̂) + z²/4) / n)) / (1 + z²/n)
```

where `p̂ = positive / total`, `n = total`.

- Return `0` when `total === 0`. **Not** `0.5`, not a prior. An unrated place has no
  evidence and must not be handed a middling score that beats a genuinely
  well-reviewed place.
- Return `0` when `total === null` or `positive === null`. The contract types these
  as `number | null` precisely so that "no reviews" and "zero reviews" are
  distinguishable.
- Map the result into `[0, 1]` for use as a component. The raw Wilson bound is
  already in `[0, 1]` for sane inputs, so do not double-normalise. Write a test
  asserting `wilsonLowerBound(0, 0) === 0` and that the bound for `(1, 1)` is
  strictly less than `1`, which is the entire point of a lower bound: one perfect
  review is not a perfect rating.
- Test the sample-size weighting property explicitly: for the same `p̂`, a larger
  `n` yields a strictly higher lower bound. That is the "weighted by sample size"
  claim in the masterplan, so it needs a test or it is just a sentence.

### 2. `components.ts`

One exported function per `ComponentId`. Each takes
`(record: ExperienceV2, ctx: DiscoveryContext, position)` and returns a
`ScoreComponent` with `normalised` in `[-1, 1]`, `contribution = weight *
normalised`, and a finished `sentence`.

| Component | Rule |
|---|---|
| `interest` | Cosine-ish overlap between `record` category and tags and `ctx.profile.interests` (a `Record<string, number>` of 0..1 weights), minus `ctx.profile.avoid`. Normalise by the sum of the profile's weights so it is in `[0, 1]`, never a raw count. |
| `rating` | `wilsonLowerBound`. Zero when unrated. |
| `value` | `1 − priceInr / budgetInr` clamped to `[0, 1]` when the price is known. **Zero contribution when the price is `estimate` confidence** and a note in the sentence saying the price is an estimate. A fabricated price must not be allowed to buy ranking. This single rule is the difference between this product and the current one. |
| `authenticity` | `record.authenticity ?? 0.5`, and the sentence must say "authenticity is unrecorded" when it is null. |
| `weather` | 1 when the record's indoor/outdoor matches `ctx.weatherSeverity`. **0.5 when weather is unknown** (`null`), not 0 and not 1. An unknown is worth half a point and the sentence says the weather is unknown. |
| `crowd` | Negative-signed: `-crowdLoad`. `record.crowdProfile ?? 0.5`. |
| `novelty` | Reward dissimilarity from what is already planned. This is the only component that needs `position` and the existing stops. |
| `groupFit` | From `hasToddler`, `hasElderly`, `partySize`, `kidFriendly`, `access`, `indoor`. Explicitly handles a `null` `kidFriendly` as unknown. |
| `travelFriction` | Negative-signed, from the injected travel minutes for the leg into this stop. |
| `reliability` | `record.providerReliability ?? 0.5`. |

**Sign discipline.** Components whose `normalised` is naturally a penalty
(`crowd`, `travelFriction`) return a **negative** `normalised`. Penalties that are
plan-level aggregates, `superlinearTravel` and `paceDeviation`, are subtracted
outside the per-stop sum. Never flip a sign twice, and never mix a `minimize`
component into a `maximize` sum. That lexicographic trap is what defeats naive
relaxation, and the masterplan calls it out by name.

### 3. `normalize.ts`

`clamp01`, `clampSigned`, `safeDiv`, `normaliseBySum`. Small, total, exhaustively
tested including `NaN` and `Infinity` inputs. A `NaN` that reaches the objective
breaks the 1e-6 comparison in a way that is very hard to debug, so every division
goes through `safeDiv` and every test feeds it a zero denominator.

### 4. `weights.ts`

- `PRIOR_WEIGHTS`: the seed. Every key present. Sensible defaults that make a cold
  start produce a defensible ranking: `interest` highest, `travelFriction` and
  `crowd` meaningful, `reliability` low because almost nothing is rated. Comment
  each value with why it is what it is. These numbers are visible to the traveller
  and editable, so they must be defensible out loud.
- `clampWeights(w)` to `[0, 1]` with a fixed sum, so the objective's absolute scale
  does not drift when a traveller edits a weight in the UI.
- `diffWeights(a, b)` returning per-component deltas for the "what changed" panel.
- `DEFAULT_WEIGHT_PRIOR_STRENGTH`: how many pseudo-observations the Beta prior gets.
  Weak, because we have no data. A strong prior would mean the bandit never moves
  and the "learned" panel is a lie. This number is a product decision; pick it
  honestly and say so.

### 5. `thompson.ts`

- `sampleWeights(bandit, rng)`: one Thompson sample per `ComponentId` from a Beta
  posterior, then mapped and clamped into a `Weights`. `rng` is injected, never
  `Math.random()`. Session 1's guard test allows `Math.random` in this one file
  only, and even here you should not use it, because determinism is worth more than
  the convenience.
- `updateBandit(bandit, rewards)`: reward in `[0, 1]` per component from an
  interaction signal. Which signals count is a product decision: an explicit save is
  1.0, an explicit reject is 0.0, a plan that was never opened is 0.4, a swap away
  is 0.1. Write those mappings down as named constants with a comment each. They
  are policy, and policy belongs in code where it can be argued with.
- `banditFromWeights(weights)`: build a `BanditState` from a prior so session 9 can
  render the panel on a first visit with no stored state.
- **Persist nothing.** Session 10 owns storage. You export pure functions over a
  `BanditState` value and say so in a comment.

### 6. `objective-fast.ts`

`objectiveFast(stops, ctx): Objective` implementing the formula in
`SESSION/00-CONTRACTS.md` section 3, exactly:

```
Σ W.cᵢ · Uᵢ  −  W.travelPenalty · superlinearTravel
             −  W.crowd · crowdLoad
             −  W.novelty · redundancyPenalty
             −  W.pacePenalty · paceDeviation
```

with `superlinearTravel = Σ_legs minutes · (1 + km/8)²`,
`redundancyPenalty` counting category-equal unordered pairs over `max(1, n-1)`, and
`paceDeviation(n, ctx) = |n − idealStops|^1.5 / max(1, idealStops)`.

"Fast" means it uses the precomputed distance matrix on the `Stop` and does not
recompute distances. It does **not** mean it is allowed to be less correct. It must
still be total and pure.

Purity requirements, non-negotiable, because the 1e-6 bound depends on them:

- No `Date.now()`, no argument-less `new Date()`, no `Math.random()`.
- No dependence on `Set` or `Map` iteration order. Sort before iterating, always.
- Accumulate per-stop values into an array, then reduce **in index order**. Do not
  fold into a running accumulator across a `for...of` over a `Set`.
- All inputs from the arguments. No module-level mutable state, no module-level
  memo keyed on anything but a pure function of the input.

### 7. `explain.ts`

`explainStop(stop, ctx, objective): ScoreComponent[]`, **sorted by
`Math.abs(contribution)` descending**. The current UI does
`reasons.slice(0, 3)` on reasons pushed in a fixed `if` order, which is not a
ranking by anything. Sort by magnitude and show the number next to the sentence.

## Constraints

- **Zero new dependencies.**
- **Purity is a correctness property here, not a style preference.** Session 6's
  drift test will fail if you break it, and it will be hard to debug. Add a test
  that calls `objectiveFast` twice on the same input and asserts bitwise-identical
  results.
- No em dash (U+2014), no emoji. No Mumbai string in `lib/engine/`.

## Verification

```
npm ci
npx tsc --noEmit
npm run lint
npx vitest run lib/engine/scoring
```

## Definition of done

1. `wilson.ts` has tests for `(0,0)`, `(1,1)`, the sample-size monotonicity
   property, and `null` inputs.
2. Every `ComponentId` has a test producing its `ScoreComponent`, with an
   exact-value assertion on `contribution`.
3. **A test asserts an `estimate`-confidence price contributes zero to `value`**
   and that the sentence says the price is an estimate. This is the rule that stops
   1064 hash-derived prices from buying ranking.
4. A test asserts `weather === 0.5` when `weatherSeverity` is `null`, not 0 and not
   1.
5. A test asserts `explainStop` output is sorted by descending absolute
   contribution, and that it is not merely a `slice` of a fixed order.
6. A test asserts two identical calls return bitwise-identical objectives.
7. A test asserts the objective is invariant to the order in which an unordered
   pair is visited, proving no `Set` iteration dependence.
8. A test asserts `NaN` and `Infinity` inputs to `safeDiv` return `0`, not `NaN`.
9. A test asserts `sampleWeights` with a fixed seeded `rng` returns a deterministic
   result, and that 200 samples from a fresh bandit produce a spread, not a point
   mass. A bandit that always returns the prior is not a bandit.
10. A test asserts `clampWeights` preserves the sum after clamping, so the
    objective's scale is stable under UI edits.
