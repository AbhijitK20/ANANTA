# The objective

Written once, here, so that session 4 (`objectiveFast`) and session 6
(`objectiveNaive`) can implement it without ever reading each other's code.
The two implementations must agree to `1e-6`. That agreement is the only
evidence in the product that the packer did not grade its own homework, so the
rules below are normative, not suggestions.

## 0. The claim

`MASTERPLAN.md` section 8, principle 1: no model decides. It proposes; the
engine disposes. Everything that decides is a pure function of
`(stops, ctx, weights)`.

## 1. Shape

```
objective(stops, ctx, W) =
      sum over stops of  W.cᵢ · Uᵢ(stops[i], ctx)        utility, maximise
    − W.travelPenalty  · superlinearTravel(stops, ctx)
    − W.crowd          · crowdLoad(stops, ctx)
    − W.novelty        · redundancyPenalty(stops)
    − W.pacePenalty    · paceDeviation(n, ctx)
```

`W` is always `ctx.profile.weights`. It is not a separate argument at the call
site, but it is written as a parameter here because the two implementations
must pull it from the same place.

There is no `minimise` term anywhere. Every penalty is subtracted. This is
deliberate: mixing `minimise` and `maximize` is the lexicographic trap that
makes naive relaxation unsound.

## 2. Purity

Both implementations obey all of these, and `lib/engine/guard/no-model.test.ts`
enforces the parts that are machine checkable.

| Rule | Why it exists |
|---|---|
| No `Date.now()`, no `new Date()` with no argument. Read `ctx.now` only. | Otherwise two calls a millisecond apart produce two objectives and the drift bound is a coin flip. |
| No `Math.random()`. Weights come from an injected `rng`. | Same. A Thompson sample is still a function of its rng. |
| No dependence on `Set` or `Map` iteration order. Sort before iterating. | Insertion order is an implementation detail, and V8 changes it. |
| No accumulation order drift. Push per stop values into an array, then `reduce` in index order. Never fold into a running total in a loop that a future edit might reorder. | `(a + b) + c` is not `a + (b + c)` in binary floating point. The reducer is the contract. |
| No module level mutable state, no module level cache keyed by anything but a pure function of the input. | A cache is a hidden input. |
| Every input arrives as an argument. | A module that reads its own globals is not testable and not reproducible. |

## 3. Geodesy: what is measured and what is derived

This is the part the contract compressed, so it is spelled out.

**Rule G-1. `Stop.travelMinutes` and `Stop.travelKm` are inputs to both
implementations. Neither one recomputes them.**

They are measurements supplied by the caller. Session 5's `buildStops` fills
them from the injected `PackOptions.matrix` and `PackOptions.originMinutes`,
which at runtime may be OSRM backed and in tests must be haversine derived.

**Rule G-2. `objectiveNaive` still owns its own haversine.** It recomputes
`haversineKm` from `record.coordinates` for the `proximityDecay` term and for
the duplicate check, using the formula below and its own copy of the constant.
`validate` reports a `distance_drift` issue when its haversine and
`Stop.travelKm` disagree by more than 1 km. That check is what keeps G-1
honest: the naive path is independent, and it proves the travel numbers it was
handed are real.

Without G-1 the `1e-6` bound is unreachable, because OSRM road kilometres and a
haversine great-circle distance differ by tens of percent. With G-1 it is
trivially reachable, and the independence that matters, independent derivation
of the objective, is fully preserved.

```
haversineKm(a, b) =
  2 * R * asin(sqrt(h))
  h        = sin²(Δlat/2) + cos(lat₁) * cos(lat₂) * sin²(Δlon/2)
  R        = 6371.0088 km  (mean Earth radius)
  angles   in radians
  coords   [lon, lat] degrees
```

`haversineKm(x, x) === 0` exactly, so the first stop costs nothing.

**Rule G-3. A stop with `travelMinutes === 0` contributes nothing to
`superlinearTravel`, whatever its `travelKm`.** The origin leg is the only leg
where the two can disagree, and the origin leg is the leg session 5 fills from
`originMinutes`. The frozen `Stop` comment says travel is 0 for the first stop;
this rule makes both readings produce the same total, so the ambiguity in that
comment cannot cost anyone the drift test.

## 4. Per stop utility

```
Uᵢ = w.interest     · interestMatch(r, ctx)
   + w.rating       · wilsonLowerBound(r)     0 when reviewCount is null
   + w.value        · valueForMoney(r, ctx)   0 when price is unknown
   + w.authenticity · (r.authenticity ?? 0.5)
   + w.weather      · weatherFit(r, ctx)      0 when weather is unknown
   + w.groupFit     · groupFit(r, ctx)
   + w.reliability  · (r.providerReliability ?? 0.5)
   + w.travelFriction · proximityDecay(stop, ctx)
```

### Rule W-1: the per stop proximity term is weighted by `w.travelFriction`

`SESSION/00-CONTRACTS.md` section 3 writes this term as `w.proximity`, and
`Weights` has no `proximity` key. `Weights` has `travelFriction`, and
`ObjectiveBreakdown.aggregate` has both `travel` and `proximity`. The two are
different functions of the same kilometres and neither duplicates the other:

- `proximityDecay` is a per stop utility, `1 / (1 + km)`, in `(0, 1]`.
- `superlinearTravel` is a whole plan penalty, quadratic in km.

So the per stop term uses `w.travelFriction`, and `aggregate.proximity` is
reported as a diagnostic and is **not** subtracted a second time. If you change
this mapping, change it in both implementations in the same commit or the
drift test tells two sessions it has a bug.

### Component id mapping

`ComponentId` names ten components. Three of them, `crowd`, `novelty` and
`travelFriction`, are aggregate level, and `aggregate` uses the names `crowd`,
`novelty`, `travel`, `proximity` and `pace`. The mapping is fixed:

| `ComponentId` | Where it lands |
|---|---|
| `interest`, `rating`, `value`, `authenticity`, `weather`, `groupFit`, `reliability` | per stop, in `Uᵢ` |
| `travelFriction` | per stop `proximityDecay` term, by rule W-1 |
| `crowd` | `aggregate.crowd`, subtracted by `w.crowd` |
| `novelty` | `aggregate.novelty`, subtracted by `w.novelty` |

### The term definitions

Every term is a total function. Missing data is a number, not a branch that
returns nothing.

```
clamp01(x) = min(1, max(0, x))
clamp11(x) = min(1, max(-1, x))
```

```
interestMatch(r, ctx):
  base  = clamp01(ctx.profile.interests[r.category] ?? 0.5)
  veto  = clamp01(ctx.profile.avoid[r.category] ?? 0)
  value = clamp11((base - 0.5) * 2 - veto)
```

An unknown category with no veto scores 0, neutral. Not disliked, not wanted.
A strong interest (`base = 1`) scores 1. A strong veto (`veto = 1`) with no
interest scores -1.

```
wilsonLowerBound(positive, total):
  total <= 0  ->  0
  p    = positive / total
  z    = 1.96
  z2   = 3.8416
  denom  = 1 + z2 / total
  centre = p + z2 / (2 * total)
  margin = z * sqrt((p * (1 - p) + z2 / (4 * total)) / total)
  return (centre - margin) / denom
```

`z = 1.96`, the 95% two sided normal quantile. Fixed, not configurable, so both
implementations use the same literal. The result is in `[0, 1]`, so it needs no
rescaling. Use `z2 = 3.8416` written as that literal in both implementations
rather than `z * z`, so there is no chance of the two disagreeing in the last
bit. 62 reviews at 4.31 average gives `p = positive / total` where
`positive = round(4.31 * 62)` if only the average is known, or the stored
`ratingSum` when it is. `ratingSum` and `reviewCount` are the inputs; never
divide a rounded average by the count.

```
valueForMoney(r, ctx):
  pricePerPersonInr === null  ->  0        price unknown, no claim either way
  pricePerPersonInr <= 0       ->  1        genuinely free is the best value
  affordable = ctx.budgetInr / max(1, ctx.partySize)
  ratio      = affordable / pricePerPersonInr
  return clamp11(ratio / 4 * 2 - 1)
```

Ratio 0 costs everything you have and scores -1. Ratio 2, half your per person
budget, scores 0. Ratio 4 scores 1. The midpoint is "costs half what you can
spend each", which is a claim a traveller can check against the receipt.

```
weatherFit(r, ctx):
  ctx.weatherSeverity === null  ->  0
  indoor  = r.indoor === "indoor"
  outdoor = r.indoor === "outdoor"
  mixed   = r.indoor === "mixed"

  "clear"      : indoor 0.4   outdoor 1      mixed 0.7
  "rain"       : indoor 1     outdoor 0.2    mixed 0.6
  "heavy_rain" : indoor 1     outdoor -1     mixed -0.4
  "storm"      : indoor 0.8   outdoor -1     mixed -0.5
```

Copy the table. Do not derive it.

```
groupFit(r, ctx):
  score = 0
  if ctx.hasToddler:
    score += r.kidFriendly === true ? 1 : r.kidFriendly === null ? 0 : -1
    score += r.access.stroller_ok === true ? 0.5 : r.access.stroller_ok === false ? -0.5 : 0
  if ctx.hasElderly:
    score += r.access.low_walking === true ? 1 : r.access.low_walking === false ? -1 : 0
  if ctx.partySize > 1 and r.capacity !== null:
    score += r.capacity >= ctx.partySize ? 0.25 : -1
  return clamp11(score)
```

A `null` fact never scores against the group. Only a recorded `false` does.

```
proximityDecay(stop, ctx):
  1 / (1 + stop.travelKm)
```

In `(0, 1]`, never negative, so it is already inside `[-1, 1]`.

```
authenticity  = r.authenticity ?? 0.5
reliability   = r.providerReliability ?? 0.5
```

Both already in `[0, 1]`.

## 5. Aggregates

```
superlinearTravel(stops, ctx) = sum over i of
    stops[i].travelMinutes * (1 + stops[i].travelKm / 8) ^ 2
```

The 8 km constant is fixed. The square is the point: in this city the sixth
kilometre costs noticeably more than the first, and a linear term cannot say
that. Per rule G-3 a stop with `travelMinutes === 0` contributes 0.

`n = 0` gives 0. The return leg to the origin is not modelled, because `Stop`
has no field for it. That is a known ceiling, not a bug to fix inside the
objective: a plan whose last stop is a 40 minute walk home is under priced.

```
crowdLoad(stops, ctx):
  n === 0  ->  0
  mean over i of  clamp01(r.crowdProfile ?? 0.5) * peakHourFactor(ctx.now, r.bestTimeOfDay)
```

Mean, not sum, so adding a stop does not inflate the penalty for every stop.

```
peakHourFactor(now, best):
  best === "any"  ->  1
  hour = hour of day from ctx.now, 0..23
  slot(hour): 5..11   -> 0    (morning)
               12..16  -> 1    (afternoon)
               17..20  -> 2    (evening)
               21..23, 0..4 -> 3 (night)
  index = { morning: 0, afternoon: 1, evening: 2, night: 3 }[best]
  t     = clamp01(abs(slot(hour) - index) / 3)
  return 1 - 0.6 * t
```

Linear, not circular, and that is on purpose. 1.0 at the record's own best
time, 0.8 one slot away, 0.4 at the opposite end of the day. A circular
version could not reach 0.4 anywhere, because on a four point ring the
farthest point from morning is evening, not night. Parse `ctx.now` in the city
timezone from the manifest, not in the machine timezone, or a traveller in
Navi Mumbai evaluating a Mumbai record gets the wrong crowd penalty.

```
redundancyPenalty(stops):
  n = stops.length
  if n <= 1  ->  0
  pairs = 0
  for i in 0..n-1: for j in i+1..n-1:
    pairs += category(stops[i]) === category(stops[j]) ? 0.5 : 0
  return pairs / max(1, n - 1)
```

`categoryEqual` is exact string equality on `record.category`, folded to
lowercase and trimmed. Divided by `n - 1`, not by the number of pairs, so the
scale is comparable across plan sizes.

```
paceDeviation(n, ctx):
  d = abs(n - ctx.idealStops)
  return (d * sqrt(d)) / max(1, ctx.idealStops)
```

`d * sqrt(d)`, written that way and not as `d ^ 1.5`. They are equal
mathematically, and only one of them is guaranteed to be the same bits in two
independently written implementations.

`aggregate.proximity` reported in the breakdown is the mean of
`proximityDecay` over stops, 0 when there are no stops. It is a diagnostic. It
already entered the total through the per stop term, by rule W-1, and must not
be subtracted again.

## 6. Composition order

Normative, because floating point addition is not associative.

```
stopValues   = []                                  // push in index order
penaltyTerms = []                                  // push in this order
for i in 0..n-1:
  stopValues.push(Uᵢ)
penaltyTerms.push(W.travelPenalty * superlinearTravel)
penaltyTerms.push(W.crowd         * crowdLoad)
penaltyTerms.push(W.novelty       * redundancyPenalty)
penaltyTerms.push(W.pacePenalty   * paceDeviation)

stopTotal   = sum(stopValues)        // index order, left to right
penaltySum  = sum(penaltyTerms)      // travel, crowd, novelty, pace
value       = stopTotal - penaltySum
```

`breakdown.total === value`, always, to the bit.

## 7. The two implementations

- `scoring/objective-fast.ts` exports `objectiveFast(stops, ctx)`. It is the
  one the packer calls, in the inner loop, on every candidate move. It may
  precompute and reuse. It must not import from `validation/`, `packing/`, or
  `replan/`.
- `validation/objective-naive.ts` exports `objectiveNaive(stops, ctx)`. It is
  the one the validator calls, once per plan. It imports nothing from
  `scoring/`, `packing/`, or `validation/`. It reads `ExperienceV2[]` and
  `DiscoveryContext` and recomputes from first principles, including its own
  haversine per rule G-2.

**They share no code. Not a constant, not a helper, not a clamp.** The point of
the `1e-6` bound is that two independent derivations of the same number agree.
One derivation checking itself is not evidence, it is arithmetic.

`validate(stops, ctx, fast)` returns `drift = abs(fast.value - naive.value)` and
`ok = drift <= 1e-6`. A drift above that is a bug in one of the two
implementations, never a reason to loosen the bound.

## 8. Known ceilings

Stated plainly, because a session that overclaims here is worth less than one
that does not.

- The return leg to the origin is not in the objective. See section 5.
- `peakHourFactor` is a four bucket linear decay, not a crowd curve. Real crowd
  data is what would replace it, and the per field provenance is what makes
  that swap honest when it happens.
- Congestion multipliers live in `CityManifest` and are a single all day
  average. They do not model a peak band, so an 8 pm taxi plan is under priced
  by roughly a factor of two. The manifest `notes` field says so out loud.
- `interestMatch` reads one category key. A record tagged with several
  categories is scored on the first one. A weighted multi tag match is the
  upgrade path.
- The objective is not calibrated against real traveller choices. The eval
  suite measures internal consistency and constraint satisfaction, not
  agreement with what people actually did.
