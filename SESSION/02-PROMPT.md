# SESSION 2 of 10 — Retrieval: BM25, Facets, Isochrone

> Copy everything below this line into a new session.

---

You are session 2 of 10 working simultaneously on **ANANTA**, a fit-first local
discovery engine at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

## Read first

1. `MASTERPLAN.md` section 3, stage 1.
2. `SESSION/00-CONTRACTS.md` **completely**. Sections 0 (three rules), 2 (frozen
   types), 4 (your frozen signatures) and 8 (blocker protocol) are binding.
3. `lib/discovery.ts` (54 lines, regex intent parsing) and `lib/recommendation.ts`
   (75 lines) so you know exactly what the current retrieval does.
4. `lib/data/factory.ts:184-189` which already contains a real `tokenize()` with a
   stopword set. It is used for video-to-place assignment at build time. Read it,
   do not import it, and do not change it.

## What exists today, and why it is not enough

`lib/recommendation.ts:36` builds a haystack string and `:40` does
`searchable.includes(normalizedQuery)`. That is a single substring test over
`"name area city category"`. No tokenisation, no stemming, no IDF, no index, no
relevance ordering. Searching `"mumbai"`, `"Mumbai"`, `"mum-bai"` and `"mumbai."`
all behave differently, and a multi-word query like `"local food culture"` only
matches a record containing that exact contiguous string.

You are replacing that with a real retrieval stage. It exists because reading the
reference implementations made it obvious we were about to jump from context
straight to the filter, and because a 1107-record catalogue with 10 categories and
23 neighbourhoods needs candidate selection before it needs a feasibility gate.

## ALLOWED — you own these files, exclusively

```
lib/engine/retrieve/bm25.ts
lib/engine/retrieve/tokenize.ts
lib/engine/retrieve/index-builder.ts
lib/engine/retrieve/facets.ts
lib/engine/retrieve/isochrone.ts
lib/engine/retrieve/retrieve.ts
lib/engine/retrieve/index.ts
lib/engine/retrieve/*.test.ts
SESSION/BLOCKERS/2.md
```

## FORBIDDEN

```
lib/engine/contracts/**      session 1
lib/engine/feasibility/**    session 3
lib/engine/scoring/**        session 4
lib/engine/packing/**        session 5
lib/engine/validation/**     session 6
lib/engine/replan/**         session 7
lib/engine/eval/**           session 10
lib/engine/index.ts          session 1, the only barrel
lib/seed.ts                  frozen
lib/data/**                  session 8
app/**  components/**        sessions 9 and 10
docs/**  scripts/**  .github/**
package.json  tsconfig.json  .eslintrc.json  vitest.config.ts  next.config.mjs
```

## Task

### 1. `tokenize.ts`

Lowercase, split on non-alphanumeric, drop a stopword list, drop tokens under 2
characters. Keep it small and deterministic. Export `tokenize(text: string): string[]`
as the frozen signature requires.

Two additions the interface does not forbid:

- A light suffix normaliser that collapses the inflections that actually matter in
  this corpus: trailing `s` on plurals, `ing`, `ed`, `es` versus `e`. Be
  conservative. Aggressive stemming is how you turn "glass" into "glas" and lose
  a real venue. Write a test with the awkward cases: `"fort"`, `"forts"`, `"forts'"`,
  `"dharamshala"`, `"galleries"`, `"cafes"`, `"ghats"`, `"vibes"`, `"krishna"`.
- A `foldForMatch` that also produces a Devanagari-free transliteration-insensitive
  comparison for the handful of records whose OSM name came back in Devanagari.
  You will find about 10 such rows in `lib/data/geocoded.generated.ts` whose `match`
  field is Devanagari, which means a reviewer cannot even sanity-check them. Do not
  build a full Indic transliterator. Normalise the Devanagari range to a stable
  token class so those records are at least *findable* and the anomaly stays
  visible rather than silently unsearchable.

### 2. `bm25.ts`

Standard Okapi BM25. `k1 = 1.2`, `b = 0.75` unless you have a reason, and if you
change them, put the reason in a comment.

- `BM25Index` holding, per document term frequency, document lengths, the average
  document length, document frequency per term, and the document count.
- `score(queryTokens: string[], docId: string): number`.
- IDF must use the smoothed form `ln(1 + (N - df + 0.5) / (df + 0.5))` so a term
  present in every document contributes zero rather than a negative number. Write a
  test for that specific case, because the naive form is a classic silent bug and
  at 1107 records with 10 shared category words it will fire.
- Field weighting: `name` should count for more than `description`, which counts
  for more than `area`, which counts for more than `station`. Either run four
  sub-indexes and combine, or use a single index with a per-field term-frequency
  multiplier. State which and why in a comment. A query for `"kharghar hills"`
  must rank the Kharghar Hills record above a record that merely mentions Kharghar
  in its description. That is your headline test.
- The index must be built once and be **immutable and reusable**. The UI will build
  it in a `useMemo`. Make that cheap: 1107 records, and the build must complete in
  single-digit milliseconds. Write a test that asserts build time under a generous
  bound so a future regression cannot quietly make the Explore page janky.

### 3. `index-builder.ts`

`buildIndex(records: ExperienceV2[]): SearchIndex` per the frozen signature.

- Index `name`, `description`, `area`, `zone`, `station`, `category`, and the
  `bestTimeOfDay` plus the `AccessNeed` and `DietNeed` values as facet tags.
- Also build an **exact-phrase field**: the record's full lowercase name and full
  description, so `retrieve` can boost an exact substring match. This is how
  "Sanjay Gandhi National Park" beats a park that mentions Sanjay Gandhi once.
- **FTS5 is a non-goal.** The contract says so, and it is right: a native module is
  a build risk and buys nothing at 1107 records. A BM25 index in memory is ~150
  lines, has no native dependency, and is fully re-derivable by a judge. Do not add
  `better-sqlite3`.

### 4. `facets.ts`

- `FACET_DIMENSIONS`: `category`, `area`, `zone`, `station`, `city`, `bestTimeOfDay`,
  `access`, `diet`, `indoor`, `priceBand`, `kidFriendly`.
- `facetCounts(index, dimension, filteredIds?)`: counts with an optional id
  restriction, so the UI can show counts that respect the active filters. Return
  counts sorted by count descending then key ascending, so the render is stable.
- `priceBand` derives from `priceInr`: `free`, `under-200`, `200-600`, `600-1500`,
  `1500-plus`, `unknown`. The `unknown` bucket must be a real bucket, not folded
  into the cheapest, because folding a fabricated price into `free` is exactly the
  dishonesty this product is built against.
- Facet values come from the record fields, never from a hardcoded city list. The
  whole point of the facet layer is that adding a city adds facets for free.

### 5. `isochrone.ts`

- `reachableFrom(origin, target, mode, manifest)` returning
  `{ reachable: boolean; minutes: number; km: number; basis: "haversine" | "corridor" }`.
- Haversine in metres, then the mode's straight-line speed, then
  `manifest.congestion[mode]`. The congestion multiplier comes from the manifest so
  no Mumbai number lives in the engine. A test asserts the engine source contains no
  city string.
- **Ferry corridors first.** If the origin and target areas match a
  `manifest.ferryCorridors` entry, use the corridor duration. This is the Navi
  Mumbai case: the ferry is faster than any road route and a pure haversine model
  gets it badly wrong. Test the Nerul to Seawoods case explicitly.
- `isochroneIds(origin, minutes, mode, manifest, records)` returning the ids inside
  the travel-time budget. This is the prefilter that takes 1107 candidates to about
  120 before anything else runs.
- Label the basis honestly in the return value. The UI is required to show
  "straight-line estimate" when `basis === "haversine"`, and
  `lib/location.ts:66-70` already sets that precedent. Do not return a number that
  the UI will present as a real route.

### 6. `retrieve.ts`

`retrieve(index, options)` per the frozen signature.

- Run the three retrievers and union them, recording `via` for each id so the UI
  can say why a thing surfaced: `"bm25"`, `"facet"`, `"isochrone"`, `"union"`.
- BM25 first, then facets, then the isochrone as a hard prefilter when
  `maxTravelMinutes` is supplied. When `maxTravelMinutes` is supplied, ids outside
  the isochrone must **never** appear, even if BM25 scored them 40. That is a hard
  prefilter and a test must prove it.
- Empty `query` with facets set is a legitimate call: facets alone, ranked by
  affinity to the origin. Test it.
- Return `totalConsidered` so the UI can show "120 of 1107 considered", which is
  the retrieval stage making itself visible.
- `limit` is a hard cap on `ids.length`, but `scores` should cover everything that
  scored, so the UI can show a runner-up. Test that `ids.length <= limit` while
  `Object.keys(scores).length` may be larger.

## Constraints

- **Zero new dependencies.**
- **Purity.** No `Date.now()`, no `Math.random()`, no `fetch`, no `fs`. Session 1's
  `no-model.test.ts` will fail the build if you break any of these, and it is
  watching the whole `lib/engine/` tree.
- Deterministic ordering everywhere. Ties break on `id` ascending, never on
  insertion order or object key order.
- No Mumbai string in `lib/engine/`. City knowledge lives in `CityManifest`.
- No em dash (U+2014), no emoji.

## Verification

```
npm ci
npx tsc --noEmit
npm run lint
npx vitest run lib/engine/retrieve
```

`npx tsc --noEmit` will report errors in other sessions' files. Filter to your own
paths. Do not fix theirs.

## Definition of done

1. `tokenize` handles the inflection edge cases listed above, with a test each.
2. The IDF-smoothing test exists and passes.
3. A test asserts `"kharghar hills"` ranks the Kharghar record first, and that an
   exact name match beats an incidental description mention.
4. A test asserts `maxTravelMinutes` is a hard floor, not a ranking hint.
5. A test asserts the ferry corridor beats the haversine estimate for Nerul to
   Seawoods.
6. A test asserts the index build is under 50 ms for 1107 synthetic records.
7. `facetCounts` has an `unknown` bucket and a test that a null price lands in it.
8. `retrieve` returns `via` for every id and never returns an id outside the
   isochrone when the budget is set.
9. `grep -ri "mumbai" lib/engine/retrieve/` returns nothing except in comments that
   name a test fixture, and even then prefer using a synthetic manifest.
