# Ananta

**A recommendation has to fit, and we have to show our work.**

Ananta is a local discovery engine for Mumbai and Navi Mumbai. It does not decide
what you might like. It decides what you can actually do: a place appears only
if it fits the time you have left, the money you brought, the access needs of
your party, the weather, the season, and the distance. When something is left
out, you get a sentence with a number in it, not a shrug.

The engine is deterministic TypeScript. **There is no model in the decision
path.** Not for ranking, not for explanation, not anywhere at runtime. That is
not a limitation we worked around, it is the thesis: a recommendation you can
re-derive is worth more than a sentence a language model wrote.

---

## Read this before you judge it

**There is no backend.** No server, no database, no API of our own, no accounts,
no sessions. It is a static Next.js app. Everything you save, publish, report or
rate is written to your own browser's `localStorage` and goes nowhere. Clearing
site data clears all of it. This is a deliberate scope decision, recorded as
[DEC-020](docs/02-planning/DECISION-LOG.md).

**There is no authentication.** `/admin/operations` and `/provider` mutate
persistent state for anyone who loads them, with no login, no authorization, no
rate limiting and no CSRF token. Both pages say so on screen.
**Do not deploy this to a public URL as it stands.** For a device-local demo it
is fine; for anything else it is not.

**Five runtime dependencies.** `@phosphor-icons/react`, `maplibre-gl`, `next`,
`react`, `react-dom`. No BM25 library, no solver, no vector database, no model
SDK, no auth package. BM25 is a hundred lines. The 2-opt and Or-opt local search
is a hundred more. CI fails the build if that list changes.

**Zero environment variables are required.** `.env.example` lists one optional
map style URL. The previous version of that file listed ten variables, nine of
which nothing read, including a Supabase service role key. They are gone.

---

## What is real and what is estimated

This is the part most demos hide. Here it is up front.

**1,090 records** across 26 areas and 10 categories, in two cities. The full
composition, with a per-field breakdown, is in
[Architecture, as it actually is](docs/03-technical/ARCHITECTURE-ACTUAL.md). The
short version:

| | Count | What it means |
|---|---|---|
| Records | 1,090 | Real place names, mostly real venues |
| Hand-curated | 199 | Carry hand-authored operational facts |
| With a matched OpenStreetMap coordinate | 380 | The pin is a real OSM feature |
| **With any opening hours on record** | **18** | **The other 1,072 have none** |

Every one of the 19 operational fields on every record carries its own
provenance and its own confidence:

| Confidence | Fields | What it means |
|---|---|---|
| `unverified` | 12,543 | Nothing is on record. **The engine refuses to guess.** |
| `community` | 4,401 | A resident or a provider said so |
| `estimate` | 3,386 | Computed. An estimate, always labelled as one |
| `verified` | 380 | Checked against a live source |

So: names, areas, zones and stations are real and mostly right. Prices,
durations and travel times on the generated records are **deterministic
estimates**, derived by hashing the record id, and they are labelled
`inferred` + `estimate` everywhere they appear. `sourceUrl` is a real URL or it
is `null`. There is not one `example.com` in this repository and a test asserts
it.

**The consequence, stated honestly:** 1,072 of 1,090 records have no opening
hours, so the feasibility gate refuses most of them and says so. That is the
product working, not the product broken. It is also the single biggest thing
missing, and it is listed as criterion 74 in
[Acceptance Criteria](docs/06-quality/ACCEPTANCE-CRITERIA.md).

---

## Run it

```bash
npm install
npm run dev            # http://localhost:3000
```

```bash
npm test               # the unit and integration suite
npm run eval           # the eval report, printed to stdout
npm run verify         # typecheck, lint, test, build, eval
```

`npm run eval` runs 22 traveller scenarios end to end, from retrieval through
the hard gate, packing, validation and replanning, and prints the success table
with the measured value beside every target. It is deterministic, it needs no
network, and a test walks the import graph to prove no host is reachable from
it.

`npm run verify` is the whole pipeline. CI runs the same five steps on every
push.

---

## Routes

| Route | What it does |
|---|---|
| `/` | Discovery search, events nearby, nearest places |
| `/explore` | Map with clustered markers, real OSRM street routing, filters, ranked results with reasons, and a panel explaining what was left out and why |
| `/trips` | The plan, its feasibility meter, and the six one-click replan triggers |
| `/experience/[id]` | Detail page with area photo, verified media, per-field provenance badges, save / plan / report |
| `/events` | Happening near me, with change detection |
| `/saved`, `/profile` | Local shortlist and the traveller profile with editable learned weights |
| `/provider` | Provider workspace: listings, real demand, request inbox |
| `/admin/operations` | The operator queue: submissions, reports, media, hidden gems, unmet demand |
| `/privacy`, `/terms`, `/contact` | Legal drafts, and a contact page that does not invent an email address |

---

## The engine

Six stages, one public barrel, imports inward only.

```
retrieve  →  feasibility  →  scoring  →  packing  →  validation  →  replan
 BM25          hard gate      one        cluster     an independent   diff against
 + facets      typed          scalar     then route  naive          an immutable
 + isochrone   Rejections     objective  2-opt       re-derivation   original
```

Three properties hold, and each is enforced by a test rather than a review
comment:

- **Pure.** No `Date.now()`, no `Math.random()`, no dependence on `Map` or `Set`
  iteration order. Every input is passed in.
- **No model.** An import of any model SDK inside `lib/engine/` fails the build.
  Both a test and an ESLint rule enforce it.
- **No city strings.** There is no "Mumbai" in `lib/engine/`. City values live in
  a `CityManifest`, and a test greps the directory to keep it that way.

### The credibility anchor

`objectiveFast` computes the score by composing precomputed components.
`objectiveNaive` recomputes the same number from first principles, sharing no
code with it, and even re-deriving its own distances from raw coordinates. They
must agree to **1e-6**. If they do not, the plan is rejected and the ladder
walks down: `strict` → `dropped_minimum` → `greedy_fill` → `single_best`, always
naming the rung and what it cost.

A packer that grades its own homework is not evidence. Two derivations that agree
is evidence, and it is the one thing a judge cannot get from a wrapper.

**Measured right now: they do not agree.** See criterion 15 in
[Acceptance Criteria](docs/06-quality/ACCEPTANCE-CRITERIA.md) for the
per-component numbers and `SESSION/BLOCKERS/10.md` for the diagnosis. We would
rather ship the disagreement with a number attached than hide it.

---

## Documentation

Start at [`docs/README.md`](docs/README.md). The documents worth your time:

- [Architecture, as it actually is](docs/03-technical/ARCHITECTURE-ACTUAL.md): 0 API routes, 0 auth, 15 pure lib modules, three optional third-party hosts, no backend by decision
- [Acceptance Criteria](docs/06-quality/ACCEPTANCE-CRITERIA.md): every criterion with a Status and the test that holds it up
- [Decision Log](docs/02-planning/DECISION-LOG.md): including the two load-bearing decisions this repository previously never wrote down
- [Masterplan](MASTERPLAN.md): the plan of record

Three documents that used to describe a ten-times-larger product are archived
under `docs/99-archive/` with a banner. They are kept as a record of what was
considered. Nothing in them is a claim about this software.

---

## Licence and data

Records are compiled from OpenStreetMap (c) OpenStreetMap contributors, Wikimedia
Commons, and hand-authored notes. Area photographs render with a named
photographer credit. Route data is (c) OpenStreetMap contributors.
