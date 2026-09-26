# SESSION 5 of 10 — Packing: Cluster, Route, Improve, Accept

> Copy everything below this line into a new session.

---

You are session 5 of 10 working simultaneously on **ANANTA**, a fit-first local
discovery engine at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

## Read first

1. `MASTERPLAN.md` section 3.3.
2. `SESSION/00-CONTRACTS.md` **completely**. Sections 0, 2, 4 (your signatures) and
   8 are binding. The `PackResult` type is yours to fill.
3. `lib/plan.ts` (108 lines) and `lib/cluster.ts` (40 lines), and
   `app/trips/page.tsx:35`.

## The defect you are replacing, and it is the worst bug in the repository

`lib/plan.ts:88-95` is a naive recursive enumerator with no pruning and no cutoff:

```ts
function choose(items, size, start = 0, selected = []) {
  if (selected.length === size) return [selected];
  const results = [];
  for (let index = start; index <= items.length - (size - selected.length); index += 1) {
    results.push(...choose(items, size, index + 1, [...selected, items[index]]));
  }
  return results;
}
```

`app/trips/page.tsx:35` calls it with `allExperiences.slice(0, 60)` inside a
`useMemo` on the render path. Materialised combinations:

| plan size | C(60, k) arrays allocated |
|---|---|
| 3 | 34,220 |
| 4 | 487,635 |
| 5 | 5,461,512 |
| 6 | 50,063,860 |
| 8 | 2,558,620,845 |

And `evaluatePlan` runs on **every** combination. A 5 stop plan is a multi-second
browser freeze on every budget-slider keystroke. There is no cap on plan size
anywhere in `lib/plan.ts`. No test covers more than 2 plan items.

You are replacing exhaustive enumeration with beam search plus local search. **Beam
search, not enumeration, is the whole point of your session.**

Also note what `lib/cluster.ts` actually is: a MapLibre marker-decimation grid
(`Math.floor(lng/cell):Math.floor(lat/cell)`, returning `undefined` cell size at
zoom >= 14). It has nothing to do with itinerary construction, despite the name.
Do not reuse it, do not edit it, and do not let its filename mislead you. The map
decimation bug at zoom 14 belongs to session 9.

## ALLOWED — you own these files, exclusively

```
lib/engine/packing/distance.ts
lib/engine/packing/graph.ts
lib/engine/packing/cliques.ts
lib/engine/packing/insertion.ts
lib/engine/packing/two-opt.ts
lib/engine/packing/or-opt.ts
lib/engine/packing/lahc.ts
lib/engine/packing/beam.ts
lib/engine/packing/penalty.ts
lib/engine/packing/pack.ts
lib/engine/packing/index.ts
lib/engine/packing/*.test.ts
SESSION/BLOCKERS/5.md
```

## FORBIDDEN

```
lib/engine/contracts/**      session 1
lib/engine/retrieve/**       session 2
lib/engine/feasibility/**    session 3
lib/engine/scoring/**        session 4
lib/engine/validation/**     session 6
lib/engine/replan/**         session 7
lib/engine/eval/**           session 10
lib/engine/index.ts          session 1
lib/engine/cluster.ts        read-only, it is map decimation
lib/seed.ts  lib/data/**     session 8 / frozen
app/**  components/**        sessions 9 and 10
lib/plan.ts  lib/plan.test.ts   read-only, do not migrate
docs/**  scripts/**  .github/**
package.json  tsconfig.json  .eslintrc.json  vitest.config.ts  next.config.mjs
```

You may import from `scoring/` (session 4, lower number, allowed by the contract).
You may **not** import from `validation/` or `replan/`. If you need the objective,
call `objectiveFast` from `@/lib/engine/scoring`. If it does not exist yet, code
against the frozen signature; it will resolve.

## Task

### 1. `distance.ts`

- Web-Mercator projection to metres at the manifest's reference latitude, then a
  squared euclidean distance matrix over the candidate ids. `O(n²)` on ~25
  candidates is 625 cells. Trivial.
- `tourCost(order, matrix): number` summing the legs plus the origin leg.
- `tourLegs(order, ctx, options)` producing the `travelMinutes` and `travelKm` per
  leg from the injected matrix. **Never fetch inside.** `PackOptions.matrix` and
  `PackOptions.originMinutes` are the only sources of travel truth. This is what
  makes you testable and what keeps the engine pure.
- Assert in a test that `distance.ts` contains no `fetch` and no clock.

### 2. `graph.ts` and `cliques.ts`

- `buildRadiusGraph(ids, matrix, radiusKm)`: adjacency where an edge exists if the
  pair is within `radiusKm`. The radius comes from `ctx.city`, not a constant.
- `bronKerbosch(graph)`: maximum-clique enumeration with pivoting on
  `P \ N(u)`, the standard `extend`/`explore`/`unassign` triple. Return cliques
  sorted by size desc then lexicographically, so the output is deterministic.
- `diameterBounded(clique, matrix, maxDiameterKm)`: keep the clique only if its
  diameter, that is the largest pairwise distance inside it, is within the bound.
  A 40 km clique is not a cluster, it is a continent.
- `clusterCandidates(ids, matrix, radiusKm, maxDiameterKm, maxClusters)`:
  peel cliques largest-first, each candidate assigned to exactly one cluster, and
  every unassigned candidate becomes a singleton cluster. **No candidate may be
  dropped.** A test asserts the union of cluster ids equals the input ids, which is
  the same invariant style as the existing `lib/cluster.test.ts:30-36`.
- Determinism matters more than optimality here. Two runs on the same input must
  produce identical clusters, because the whole eval report depends on it.

### 3. `insertion.ts`, `two-opt.ts`, `or-opt.ts`

- `nearestInsertion(order, candidateId, matrix)`: cheapest insertion position by
  added tour cost, ties broken by lowest index.
- `twoOpt(order, matrix, improve)`: the standard 2-opt segment reversal while
  `improve(order)` strictly decreases. Cap iterations so it terminates.
- `orOpt(order, matrix, improve)`: relocate segments of length 1 to 3, both
  orientations. This is what fixes the "one stop is stranded on the far side"
  failure that 2-opt alone cannot.
- Both must terminate on a worst case and must be idempotent: running twice
  changes nothing the second time. Test both properties.

### 4. `penalty.ts`

Adaptive penalties, the "A" in LAHC:
- A penalty per `(from, to)` ordered pair that has been used before, growing with
  each reuse. Classic adaptive penalty from the TSP literature.
- `PenaltyTable` with `record(order)`, `decay(rate)`, and `reset()`. Decay is what
  lets the search escape a plateau.
- A pure test: recording the same order twice makes it strictly more expensive to
  repeat, and `decay` reduces every penalty strictly.

### 5. `lahc.ts`

Late Acceptance Hill Climbing, the only real anti-local-optima mechanism in the
reference set:
- `lahc({ sample, accept, iterations, historyLength, seed })` with the standard
  loop: sample `L` candidates, accept the `i`-th if it is at least as good as the
  candidate from `historyLength` iterations ago, else fall back to current.
- **Seeded LCG for `seed`, defaulting to a fixed value.** No `Math.random()`. The
  eval report must be byte-reproducible across runs, or the 1e-6 drift comparison
  becomes flaky and session 6's test becomes noise.
- Return `{ best, current, history, accepted, evaluated }` so `searchStats` in
  `PackResult` is real rather than decorative.
- Test: with `historyLength = 1` and a seeded rng, two runs give identical results.
  Test: a deliberately multimodal cost function where plain hill climbing gets
  stuck and LAHC finds the better basin. That is the test that justifies the
  algorithm existing.

### 6. `beam.ts`

- `beamSearch(candidates, width, expand, score)`: keep the `width` best partial
  solutions, expand each, prune. **This replaces `choose()`.** No enumeration, no
  recursion over combinations, no materialised array of all subsets.
- The expansion function caps the number of children per node so the branching
  factor cannot explode. Default to the top `k` candidates by partial score, `k`
  small.
- Test: a synthetic 25-candidate instance completes in well under 50 ms. Test: the
  number of `score` calls is bounded by `width * iterations * k`, asserted
  explicitly. That assertion is the regression guard against reintroducing `C(60,k)`.

### 7. `pack.ts`

`pack(candidates, ctx, options): PackResult` wiring the masterplan's six steps:

1. Build the radius graph over feasible candidates.
2. Peel diameter-bounded maximum cliques into clusters.
3. Order clusters by summed per-stop score. Take the top 2 to 4, bounded by
   `ctx.idealStops`.
4. Order each cluster's tour: cheapest-insertion, then 2-opt, then Or-opt.
5. Stitch clusters at their closest POI pair, then run 2-opt and Or-opt across the
   whole stitched tour.
6. If short of `ctx.minStops`, harvest the best remaining candidates from adjacent
   clusters, highest score first, respecting the objective.
7. Accept with LAHC plus restart-from-best plus the adaptive penalty table.
8. `buildStops(order, ctx, options)` assigning `arriveBy`, `travelMinutes`,
   `travelKm`, `visitMinutes`, `bufferMinutes`, `costInr` per stop. The buffer is
   the `DEFAULT_BUFFER_MINUTES` constant exported by session 3. **Import it, do not
   re-declare it.** Two hardcoded 15s that agree by luck is the current bug.
9. `objective: objectiveFast(stops, ctx)`.
10. `rung: "strict"` and `relaxationNote` stating that nothing was relaxed. Session
    6 owns the ladder that sets a different rung.

`costInr` must be `priceInr * ctx.partySize` (or `pricePerPersonInr * partySize`),
and the current `lib/plan.ts:30-32` `parsePrice` bug must not be reproduced: it
strips non-digits, so `"From 300"` becomes `300` and a per-person price is treated
as a group price. The v2 type has real numeric fields precisely to avoid this.

### 8. Known ceiling, and you must state it in a comment

Greedy insertion plus local search is not guaranteed optimal. At the 2 to 4 stops
this product ships, the gap to the Held-Karp optimum is small, and a comment
saying so with the reasoning is more valuable than a claim of optimality. Use a
`ponytail:` comment naming the ceiling and the upgrade path. Do not implement
Held-Karp; at 4 stops it is microseconds of gain for real complexity.

## Constraints

- **Zero new dependencies.** No `or-tools`, no WASM solver, no `pako`. Every
  algorithm above is a few dozen lines.
- **Purity.** No `Date.now()`, no `Math.random()`, no `fetch`. Seeded LCG only.
  Session 1's guard test is watching the whole tree.
- Deterministic: identical input plus identical seed gives identical output. Test it.
- No em dash (U+2014), no emoji. No Mumbai string in `lib/engine/`.

## Verification

```
npm ci
npx tsc --noEmit
npm run lint
npx vitest run lib/engine/packing
```

## Definition of done

1. A test asserts the union of cluster ids equals the input ids exactly, with no
   loss and no duplication, at several radii.
2. A test asserts `bronKerbosch` on a known graph returns the known maximum clique,
   and returns them in a deterministic order.
3. A test asserts `diameterBounded` rejects a clique whose diameter exceeds the
   bound.
4. Idempotence tests for `twoOpt` and `orOpt`: a second run changes nothing.
5. A test asserts LAHC escapes a multimodal cost function that plain hill climbing
   fails, and that two seeded runs are identical.
6. **A test asserts `beamSearch` on 25 candidates stays under 50 ms and that its
   `score` call count is bounded by `width * iterations * k`.** This is the test
   that stops anyone reintroducing `C(60, k)`.
7. A test asserts `pack` returns `rung: "strict"` on a feasible instance and a
   `relaxationNote` that claims nothing was relaxed.
8. A test asserts `buildStops` assigns `arriveBy` monotonically and that the total
   window consumed equals `Σ (travel + visit + buffer)`.
9. A test asserts `costInr` equals price times party size, using a record whose
   price string would have fooled the old `parsePrice`.
10. A test asserts two `pack` calls with the same seed return deep-equal
    `PackResult`.
11. `searchStats.candidates`, `.evaluated` and `.acceptedImprovements` are all
    non-zero on a real instance, so the debug view is not showing zeros.
