# ANANTA — Master Plan (final)

> Don't optimise for places. **Optimise for moments.**

**Status:** single source of truth. Supersedes `Local-Experiences-Masterplan.md` and
every prior planning draft. The prior drafts move to `docs/99-archive/` with a
one-line banner each. Do not edit them; do not link to them from anything a judge
will read.

**Frozen execution contracts:** [`SESSION/00-CONTRACTS.md`](SESSION/00-CONTRACTS.md)

---

## 0. Read this if you read nothing else

ANANTA is a **fit-first local discovery engine**. The differentiator is not "AI
recommendations". It is that a recommendation is something that must **fit**, and
that we **show our work and prove it**.

Three things to internalise:

1. **The engine is deterministic TypeScript. No model is in the decision path, ever.**
   The eval suite must pass with zero network and zero model calls. Not "degrades
   gracefully without a model" — there is no model.
2. **Nothing is recommended that does not fit.** Time, money, opening hours,
   capacity, group fit, accessibility, weather, distance, seasonality, diet are
   **hard filters, not ranking weights**. A record either passes the gate or it is
   not shown, and it carries a typed `Rejection` with a finished sentence and a
   numeric shortfall.
3. **Every field says where it came from.** `curated | provider | osm | inferred |
   derived`, per field, with a confidence tier. An inferred field is labelled as
   one, always, in the data and in the UI.

---

## 1. Reconciliation of the three prior plans

Three drafts were supplied. They disagree. This table is the ruling; anything not
listed here follows from the winning column.

| Decision | ATHITI v3 | TRAVELBUDDY definitive | **ANANTA (final)** | Why |
|---|---|---|---|---|
| Backend | FastAPI + Postgres + Redis | FastAPI + Postgres + Redis | **None. Static Next.js + `localStorage`** | Repo has 0 API routes, 0 server code, 0 auth. A backend is a rewrite, not a feature. |
| Constraint solving | plain Python assertions | Z3 SMT + unsat cores | **Named relaxation ladder in TS** | No Python service. "Unsat core" is a research artefact, not a demo. A named rung with a stated cost is honest and shippable. |
| Retrieval | pgvector + BGE-M3 + cross-encoder reranker | PostGIS + pgvector + reranker + CatBoost | **BM25 over a committed in-memory index + tag facets + isochrone prefilter** | No Postgres. BM25 is ~150 lines and re-derivable. Embeddings need a model, which breaks rule 1. |
| Ranking | GBDT / LightFM | CatBoost / LightGBM | **Scalarised weighted sum, per-traveller weights, Thompson-sampling prior** | Zero training data. An LTR model cannot be fitted. A bandit over ~10 interpretable weights can. |
| Packing | OR-Tools | OR-Tools | **Hand-rolled cluster-then-route: clique peel → nearest-insertion → 2-opt → Or-opt, under LAHC** | No native solver dep, no Python. 2-opt/Or-opt on ≤25 candidates is microseconds. |
| Validation | deterministic checker | Z3 feasibility | **Independent naive re-derivation of the objective, reject on drift > 1e-6** | All three plans agree here. This is the credibility anchor. Keep it. |
| Replanning | LLM narrates | preserve intent | **Diff against immutable `original`, emit `Swap[]` with reason + score delta** | All three agree. Never diff against the last mutation. |
| LLM role | NLU + explain | NLU + explain | **Absent from the runtime. Permitted only as an offline authoring tool** | Rule 1. The honest answer to "where is the AI" is "there isn't any, and here is the proof". |
| Learning | contextual bandit | bandits at Phase 7 | **Thompson sampling on the weight vector, seeded, persisted, editable, visible** | Interpretable, demoable, and honest about a cold start. |
| Demo city | one neighbourhood | Jaipur | **Mumbai + Navi Mumbai** (data exists: 1107 records, 391 OSM pins) | Jaipur has zero records. Switching cities throws away the only real asset. |
| City portability | implicit | "destination-agnostic" | **Explicit `CityManifest`; no Mumbai string in `lib/engine/`** | Enforced by a test. |
| Gamification | cut | n/a | **None** | All plans agree. |
| Payments / booking | n/a | provider platform | **Requests, not transactions. No payments, no commission, no disputes** | Non-negotiable, stated so nobody relitigates it mid-week. |

**Also settled:** no FTS5/better-sqlite3 (a native module is a build risk and buys
nothing at 1107 records), no Orama, no Marathi tokenizer, no Redis, no vector DB,
no reranker model, no bandit server. **Zero new runtime dependencies. Total.**

---

## 2. What ships, stated against reality

Verified against the code, not against a plan.

### Exists and is worth keeping

- Next.js 14 App Router, 13 routes, 5 runtime deps, fully offline-capable.
- **1107 records**: 43 hand-curated + 1064 real Mumbai/Navi Mumbai place names
  generated from 10 category tables across 23 verified neighbourhood anchors.
- **391 records with real OSM coordinates** (committed snapshot, monthly CI refresh
  with a strict precision-first matcher).
- **340 YouTube videos + 70 Wikimedia images**, existence-verified against live
  oEmbed / MediaWiki, with correct tri-state error handling that never treats a
  rate limit as proof of absence. The single best-engineered asset in the repo.
- **Real OSRM street routing** with two-router failover, sessionStorage cache,
  per-mode profiles, and an honestly-labelled straight-line fallback.
- 86 meaningful unit tests, several asserting exact arithmetic (`plan.test.ts`
  pins `totalMinutes === 147`).
- A provenance/confidence legend already surfaced in the UI, and a long list of
  honest "this is a demo estimate, not a live claim" disclosures.

### Exists and is actively harmful — fix before demo

| Defect | Location | Impact |
|---|---|---|
| **Exhaustive `C(60,k)` enumeration in a `useMemo` on the render path** | `lib/plan.ts:88-95`, called `app/trips/page.tsx:35` | 5.46M array allocations at 5 stops, 2.5 billion at 8. Browser freeze / OOM. |
| **`npm test` is red on `main`** | `lib/data/dataset.test.ts:11` requires ≥100/category; Culture=90, Nature=98 | CI is failing. A judge who runs `npm test` sees red. |
| **Fabricated wall clock** `\`${index+1}:15 PM\`` | `app/trips/page.tsx:126` | Presents a string template as a schedule. Worst honesty defect. |
| **3 places silently dropped** | `"Breach Candy"` missing from `lib/data/zones.ts:9-33`; `lib/data/factory.ts:123` `continue`s with no warning | Authored content vanishes. |
| **`sourceUrl` is `https://example.com/sources/<id>` on 1107/1107 records** | `lib/seed.ts:29`, `lib/data/factory.ts:153` | A citation field that is a guaranteed 404, and is never rendered. |
| **All 70 images credited "Wikimedia Commons contributor"** | `lib/data/images.generated.ts` | Commons attribution requires naming the author. A real licensing defect. |
| **~35 wrong-venue OSM pins** (a hospital pinned to a restaurant, one building pinned 6 times) | `lib/data/geocoded.generated.ts` | Shipped under the *strongest* confidence label. |
| **Time gate is enforced against noise** | `lib/data/factory.ts:85` `travelMinutes: 4 + (hash(id) % 46)` | The "Feasible" badge on a 5-stop plan means nothing about the traveller's day. |
| **`statusTone: "amber"` conflates weather / seasonality / awaiting-a-phone-call** | `lib/recommendation.ts:45`, locked in by `lib/recommendation.test.ts:33` | A fort history walk is rejected as "Weather dependent" for wanting an operator callback. |
| **`allExperiences.find(...)` as the "indoor alternative"** | `app/trips/page.tsx:94` | First non-amber record in array order, ignoring location, budget and time. |
| **Unescaped `Popup.setHTML()` with venue names** | `components/map.tsx:59, 83` | Unescaped-HTML path over data a monthly CI job rewrites from Overpass. |
| **`/provider` and `/admin/operations` have zero inbound links** | no `href` in any route | Two whole surfaces are unreachable by navigation. |
| **No footer** | — | `/privacy` and `/terms` are desktop-nav-only, therefore unreachable on the mobile demo viewport. |

### Absent, and is the actual product

- No plan generator. `lib/plan.ts` audits a hand-clicked list; it does not build one.
- No typed `Rejection`. 15 untyped English strings, only 3 carrying a shortfall.
- No independent validator. `plan.ts:60` checks the same locals it just computed.
- No relaxation ladder. One unnamed `if (!combinations.length) return []`.
- No Thompson sampling, no persisted weights, no "what I learned about you".
- No opening hours, no capacity, no accessibility, no indoor/outdoor, no diet, no
  seasonality field, no ratings, no reviews. 8 of 15 graded fields do not exist, and
  the schema has nowhere to put them, so every filter built on them is
  structurally impossible.
- No unmet-demand feed and no request inbox. Nothing anywhere logs a search. The
  `result.excluded` array that the entire provider flywheel depends on is computed
  in memory and discarded on navigation.
- No publish path. The provider page promises "an admin publishes the listing"; the
  admin page has no publish action. The loop is severed at the exact step that
  makes it a loop.

### The docs describe a different, ~10x larger product

`docs/03-technical/API-SPEC.md` documents 23 endpoints. `ARCHITECTURE.md` draws a
PostgreSQL box. `DATA-MODEL.md` specifies 14 entities. `Local-Experiences-Masterplan.md`
is 2198 lines of RBAC, Kafka-era ML infra and monetisation and contains the string
"Ananta" zero times. `PRD.md` promises role-based authorization on two
unauthenticated pages that mutate persistent state. This is the single largest
credibility risk in the repo, and it is fixed entirely by **deletions and status
columns**, not by code.

---

## 3. The pipeline

```
DiscoveryContext  (holds `original` forever, immutable)
  │
  ├─ ① RETRIEVE    BM25 over name/description/keywords + tag facets
  │                + isochrone prefilter                        → ~120
  │
  ├─ ② FEASIBLE    hard gate, cheapest check first. Every drop
  │                emits Rejection{code, sentence, shortfall, unit} → ~12–25
  │
  ├─ ③ SCORE       one scalar objective, named components, per-traveller
  │                weights (Thompson-sampled, visible, editable)
  │
  ├─ ④ PACK        cluster-then-route: clique peel → cheapest-insertion
  │                → 2-opt → Or-opt, under LAHC + restart-from-best  → 2–4 stops
  │
  ├─ ⑤ VALIDATE    independent naive re-derivation of the objective.
  │                Reject if |objectiveFast − objectiveNaive| > 1e-6.
  │
  └─ ⑥ RELAX       named ladder: strict → dropped_minimum → greedy_fill
                   → single_best. Always states the rung and what it cost.
```

Stage ① exists because reading the reference implementations made it obvious we
were about to jump from context straight to the filter. Stage ⑤ exists because a
packer that grades its own homework is not evidence.

### 3.1 The feasibility gate

Checked in this order, cheapest first. Full code list in `SESSION/00-CONTRACTS.md`.

| Check | Rejection code |
|---|---|
| isochrone contains origin | `too_far` |
| `travel + duration + buffer ≤ availableMin` | `travel_time_exceeds_budget`, `duration_exceeds_budget` |
| open for the whole visit window | `closed_now`, `closed_during_window`, `hours_unverified` |
| `price × partySize ≤ budget` | `over_budget`, `over_budget_per_person` |
| `capacity ≥ partySize` | `capacity_exceeded` |
| every `AccessNeed` satisfied | `not_step_free`, `not_stroller_ok`, `no_accessible_restroom`, `requires_steps` |
| diets satisfiable | `diet_mismatch` |
| slot not sold out | `sold_out` |
| bookable with enough notice | `requires_booking_not_available`, `lead_time_too_short` |
| safe in this weather | `weather_unsafe` |
| not already planned / not excluded | `duplicate`, `already_planned`, `excluded_by_traveller` |
| in season | `seasonal_mismatch` |

Every `Rejection.sentence` is a finished sentence carrying real numbers:
*"Needs 40 min more than you have left"*, not *"constraint violated"*. Two
consumers: the "why not that" panel, and the provider unmet-demand feed. A
rejection is a feature, not an error — if we cannot say why something is missing,
the engine is not finished.

### 3.2 Scoring

One scalar, split into named components, so it is auditable and re-derivable.
Maximise-only; `minimize` and `maximize` are never mixed, because that
lexicographic trap is what defeats naive relaxation.

Components: interest match, Bayesian-smoothed rating (Wilson lower bound weighted
by sample size), value for money, local authenticity, weather fit, peak-hour crowd
penalty, novelty vs. what is already planned, group fit, superlinear travel-friction
penalty, provider reliability.

**The objective is a pure function.** No `Date.now()`, no `Math.random()`, no
dependence on `Set`/`Map` iteration order. This is what makes the 1e-6 drift bound
achievable rather than aspirational.

Weights are per-traveller, Thompson-sampled from the interaction stream, and shown
to the traveller in an editable panel. A recommendation you cannot interrogate is
just a vibe. Nothing is learned without being visible and editable.

### 3.3 Packing

1. Radius graph over feasible candidates in Web-Mercator metres.
2. Peel maximum cliques with Bron–Kerbosch → **diameter-bounded** clusters.
3. Order clusters by summed score; take the top 2–4.
4. Order the cluster tour: cheapest-insertion → 2-opt → Or-opt.
5. Stitch clusters at their closest POI pair.
6. If short of stops, harvest the best remaining from an adjacent cluster.

Accepted under **LAHC + restart-from-best + adaptive penalties**. Beam search, not
exhaustive enumeration — this is the direct fix for the `C(60,k)` defect.

### 3.4 Validation and relaxation

`objectiveFast` (composed, uses precomputed matrices) and `objectiveNaive` (reads
records from scratch, shares no code with the fast path) must agree to 1e-6. That
is the whole trick: self-consistency is not validation.

On failure, walk a **named** ladder and state the rung and the cost. "Relaxed:
minimum 1 stop instead of 2" beats an unsat core, and unlike an unsat core it is
honest.

### 3.5 Adaptive replanning

Triggers, all one click, all demo-able:

| Trigger | Effect |
|---|---|
| It started raining | outdoor items lose the weather gate; indoor gain |
| We lost 90 minutes | re-pack into the smaller window; prefer fewer, closer stops |
| This one's sold out | pin the rest, re-solve, emit a minimal swap set |
| Budget dropped | prune to what fits, show what was cut and why |
| The toddler needs a bathroom | add `restroom` to `accessNeeds` |
| They're tired | soften the pace, raise the Stress Radar |

Every replan returns `Swap[]` with a written reason and a score delta. **Median
swaps per context change ≤ 2 is the demo metric.**

---

## 4. Explainability is the thesis, not a feature

- **Why this** — ranked score contributions, each a finished sentence, ordered by
  magnitude, with the raw number shown. Not three hardcoded strings.
- **Why not that** — the `Rejection` for a specific thing the traveller asked
  about, surfaced when they tap something that did not appear. Includes near-misses
  and the single cheapest constraint to relax.
- **The feasibility meter** — `activity ▸ travel ▸ buffer` against the remaining
  window, overflow in the alarm colour. The signature UI element.
- **Provenance badges** — per field, not per record. "Price: inferred, low
  confidence" is a different claim from "Coordinates: OSM, verified".
- **What I learned about you** — the learned weights, editable.
- **The Stress Radar** — 7 weighted dimensions, 0–100, with one concrete rescue move
  for the single worst factor.

---

## 5. Data strategy

Three layers, because raw OSM cannot carry this product.

| Layer | What | How |
|---|---|---|
| **Spine** | Real coordinates, names, categories, addresses, partial hours | OSM via Overpass, strict precision-first matcher, committed offline snapshot. The demo never touches the network. |
| **Experience** | The fields OSM lacks: duration, price, capacity, kid-friendly, step-free, indoor/outdoor, booking, seasonality, best time of day, diet | Hand-authored, per field, with provenance. This is the demo catalogue and the thing the gate depends on. |
| **Signals** | Reviews (author, date, party type, party size, spend), event calendar | Seeded. Powers Bayesian ratings and the "reviews mention: gets crowded after 5pm" insight. |

**The measurement that forces three layers:** a Bandra West bbox returns 199 POIs.
91% have `name`; 16% have `opening_hours`; 1% have `wheelchair`; 0% have `fee`; and
OSM has no ratings at all. A scrape-and-list build cannot satisfy a single graded
factor.

**No silent fabrication.** Where a field is not known it is `unverified` and the
gate emits `hours_unverified` rather than guessing. Hash-derived prices and
durations are legal only as `inferred` + `estimate`, must be labelled in the UI, and
may never satisfy a hard constraint on their own.

---

## 6. City portability

A `CityManifest` — bbox, neighbourhoods, timezone, currency, monsoon months,
congestion model per mode, transit corridors. **No Mumbai-specific string may exist
in `lib/engine/`**, enforced by a test that greps the directory.

Navi Mumbai first as the second city, because it stresses the model properly:
planned grid versus island city, ferry corridors, a genuinely different travel-time
structure. Adding a city is: add a manifest, run the harvest, curate.

---

## 7. Provider side

- A listing with real availability, capacity and pricing, per-field provenance.
- A request inbox. Requests, not transactions.
- **An unmet-demand feed**: what travellers nearby searched for, could not get, and
  **which single constraint killed it** — sourced directly from the `Rejection`
  stream. This is the economic loop and it is currently unbuilt end to end.
- An admin publish action that actually inserts into the discoverable catalogue.

---

## 8. Non-negotiable engineering principles

1. **No model decides.** It proposes; the engine disposes. An import of any model
   SDK, or any `fetch` to a model endpoint, inside `lib/engine/` is a **build
   failure**, enforced by a test that walks the import graph.
2. **A rejection is a feature, not an error.**
3. **Never replace the traveller's intent.** Diff against `original`, forever.
4. **Every number is sourced or it is labelled as an estimate.** No exceptions, in
   data or in copy.
5. **The eval suite passes with no network.** If a test needs the internet, it is
   the wrong test.

---

## 9. Success criteria — shipped *and measured*

| Metric | Target | Enforced by |
|---|---|---|
| Constraint-satisfaction rate | **100% by construction** | gate cannot emit a passing record that violates a hard constraint |
| Objective agreement (fast vs naive) | drift ≤ 1e-6 on 100% of eval scenarios | `lib/engine/validation` |
| Time utilisation | > 85% of the stated window | eval report |
| Coverage | ≥ 90% of eval scenarios yield a plan | eval report |
| Median swaps per context change | ≤ 2 | `lib/engine/eval` |
| Median travel per stop | < 1.8 km | eval report |
| Provider unmet-demand actionability | ≥ 80% | `lib/engine/eval` |
| **Eval suite green with no network** | yes | `npm test` in CI, network disabled |
| Zero new runtime dependencies | yes | `package.json` diff check in CI |
| Zero legacy product names in the repo | yes | grep test |
| No em dash, no emoji in product copy | yes | ESLint `no-restricted-syntax` |

**The credibility anchor is the second row.** "Here is the plan, here is the
independent checker output, 100% pass, here is the code that produced both" is the
one thing a judge cannot get from a ChatGPT wrapper.

---

## 10. Ten tasks, zero file overlap

Executed as 10 parallel sessions. Ownership map, forbidden paths, and the
coordination protocol are in [`SESSION/00-CONTRACTS.md`](SESSION/00-CONTRACTS.md).

| # | Owns | Delivers |
|---|---|---|
| 1 | `lib/engine/contracts/`, `lib/engine/index.ts` | Frozen types, the objective spec, the no-model-in-engine guard test |
| 2 | `lib/engine/retrieve/` | BM25 index, tag facets, isochrone prefilter |
| 3 | `lib/engine/feasibility/` | The hard gate, typed `Rejection`s, all 20+ codes |
| 4 | `lib/engine/scoring/` | The scalar objective (fast path), Wilson bound, Thompson weights |
| 5 | `lib/engine/packing/` | Clique peel, insertion, 2-opt, Or-opt, LAHC, beam search |
| 6 | `lib/engine/validation/` | Naive objective re-derivation, drift check, relaxation ladder |
| 7 | `lib/engine/replan/` | `original` diffing, `Swap[]`, the six triggers |
| 8 | `lib/data/`, `lib/seed.ts`, `scripts/` | Graded fields, provenance population, 250 curated records, data-integrity fixes |
| 9 | `app/explore`, `app/trips`, `app/experience`, `components/ananta/` | Feasibility meter, why-this, why-not-that, Stress Radar, learned-weights panel |
| 10 | `app/provider`, `app/admin`, `lib/engine/eval/`, `docs/`, CI + config | Unmet-demand feed, request inbox, publish path, eval harness, docs calibration |

Sessions 1–7 cannot see each other's output on the first run. That is fine and
deliberate: every cross-session symbol they need is **written out as code** in
`SESSION/00-CONTRACTS.md`, so nobody has to wait, nobody has to negotiate, and
nobody creates a duplicate type that later has to be reconciled.

---

## 11. What we are deliberately not doing

Stated so nobody relitigates it in the middle of the week:

- No payments, commission, payouts or disputes. Requests, not transactions.
- No Z3, no OR-Tools, no SAT solver, no Python service.
- No vector database, no embedding model, no cross-encoder reranker.
- No Google Maps scraping. ToS.
- No learning-to-rank. We have no training data. Interpretable features plus a
  bandit are more honest and demo better.
- No gamification, no proof-of-presence, no BLE beacons, no Kafka.
- No authentication. Every surface is a local demo. `/admin` and `/provider` mutate
  `localStorage` only and this is stated in the UI and in the docs.
- No new runtime dependencies, at all.

---

## 12. Calibration is the last 10% of the work and the first 10% of credibility

Before any of the above is demoed, the documentation must tell the truth. Fixing
this requires zero product code:

1. Archive `Local-Experiences-Masterplan.md` and `docs/03-technical/API-SPEC.md`.
2. Add `docs/03-technical/ARCHITECTURE-ACTUAL.md`: 11 routes, 0 API routes,
   `localStorage`, 15 pure lib modules, OSRM/Overpass/Commons as the only network
   dependencies, no backend by decision.
3. Rewrite `docs/06-quality/ACCEPTANCE-CRITERIA.md` as a table with a **Status**
   column and an **Enforced by** column. 30 requirements with 0 automated checks
   currently reads as a wish list. 30 requirements with 22 verified and 8 honestly
   marked "not built, no data field" reads as engineering.
4. State the dataset composition in one place: *1107 records = 43 hand-curated +
   1064 real place names; 391 have verified OSM coordinates; every derived price,
   duration and travel time is a deterministic estimate, labelled as such.*
5. Record the decisions that are currently undocumented and load-bearing: no
   backend, no model in the runtime, hash-derived estimates as a labelled
   deliberate choice.
6. Delete the `Local Tourist` app name from `.env.example` and the nine env vars
   that nothing reads.
7. Delete the `ITERATIVE-BROWSER-QA.md` lines that contradict each other, or the
   whole file if the harness cannot be made runnable on a clean checkout.

**A hackathon rubric rewards scoped honesty over a fake-complete checklist. The
engine in this repo is genuinely good. The documentation is currently the only
thing standing between it and a judge concluding the team did not finish.**
