# Architecture, as it actually is

> This is the document to believe. It is written by reading the code, not the
> plan. Where it disagrees with anything else in `docs/`, it wins.
>
> The previous architecture document described a FastAPI service, a PostgreSQL
> database and a message queue. None of them exist. That document is kept at
> `docs/99-archive/ARCHITECTURE-PROPOSED.md` as a record of what was considered.

Last verified against the tree on the commit that introduced this file.

## What this is

A **static Next.js 14 App Router application with no backend**. It is a bundle of
TypeScript that runs in the visitor's browser, plus a set of committed data
snapshots. There is no server process, no database, no API of our own, and no
account system.

The engine is deterministic TypeScript. There is no model in the decision path.

## The one diagram that matters

```
                        the browser
  ┌───────────────────────────────────────────────────────────────┐
  │                                                               │
  │   app/**  ──►  lib/engine/**  ──►  lib/engine/contracts/**    │
  │   (routes)      (the engine)      (types only, no runtime)    │
  │      │               │                                       │
  │      │               └── reads ──►  lib/data/ananta/**         │
  │      │                                (committed records)     │
  │      │                                                       │
  │      └── writes ──►  localStorage, keys prefixed ananta-*      │
  │                     plan, saved, provider listings,            │
  │                     operations, media records, reports,        │
  │                     demand rows, requests, stale ids,          │
  │                     learned weights                           │
  └───────────────────────────────────────────────────────────────┘
        │                                    │
        │ outbound only,                    │ outbound only,
        │ from the visitor's action         │ from a CI job
        ▼                                    ▼
  OSRM routing,                     Overpass (geocoding),
  OpenFreeMap tiles,                YouTube oEmbed,
  Wikimedia Commons                 MediaWiki
```

Arrows leaving the box are **reads of public third-party endpoints**, not calls to
a service we run. They are all optional, all cached, and every one of them has a
labelled fallback. The engine never depends on any of them.

## The engine

Six stages, in this order. Each imports from `contracts/` and from earlier
numbered stages only. There is one public barrel, `lib/engine/index.ts`, and it
is the only thing the UI imports.

| Stage | Directory | What it owns |
|---|---|---|
| 1 | `lib/engine/retrieve/` | BM25 over a committed in-memory index, tag facets, isochrone prefilter |
| 2 | `lib/engine/feasibility/` | The hard gate. Emits a typed `Rejection` for every refusal, with a finished sentence and a numeric shortfall |
| 3 | `lib/engine/scoring/` | One scalar objective, split into named components, with per-traveller weights sampled from a Thompson-sampling prior |
| 4 | `lib/engine/packing/` | Cluster then route: clique peel, cheapest insertion, 2-opt, Or-opt, under LAHC with restart from best |
| 5 | `lib/engine/validation/` | An independent naive re-derivation of the objective, and a rejection on drift above 1e-6 |
| 6 | `lib/engine/replan/` | Diffing against an immutable `original`, emitting `Swap[]` with a reason and a score delta |

`lib/engine/eval/` is the measurement harness: 22 scenarios run end to end and
the results are asserted as thresholds in the test suite.

Three properties hold across all six, and each is enforced by a test rather
than a code review:

- **Pure.** No `Date.now()`, no `Math.random()`, no dependence on `Map` or `Set`
  iteration order. Every input is passed in.
- **No model.** An import of any model SDK inside `lib/engine/` is a build
  failure, enforced by `lib/engine/guard/no-model.test.ts` and by an ESLint
  `no-restricted-imports` rule.
- **No city strings.** There is no Mumbai in `lib/engine/`. City-specific values
  live in a `CityManifest` and adding a city means adding a manifest.

## The dataset, in one place

This paragraph is the only place in the repository where the dataset is
described. If any other document disagrees with it, this paragraph is right.

**1,090 records. 199 are hand-curated and carry hand-authored Experience-layer
facts. 891 are real place names generated from ten category tables across 26
verified neighbourhood anchors. 380 of the 1,090 have a coordinate matched and
validated against OpenStreetMap. 1,072 have no opening hours on record at all,
and the gate refuses them rather than guessing.**

Per field, across all 19 provenanced fields and all 1,090 records:

| Provenance | Field count | What it means |
|---|---|---|
| `curated` | 4,357 | Hand-entered. A person wrote it. |
| `inferred` | 15,929 | Derived by a deterministic function. An estimate, always labelled. |
| `osm` | 380 | Matched to a real OpenStreetMap feature. |
| `provider` | 44 | Typed by a provider in the listing form. Their claim, not a verified figure. |

| Confidence | Field count | What it means |
|---|---|---|
| `unverified` | 12,543 | Nothing is on record. The engine refuses to guess. |
| `community` | 4,401 | A resident or a provider said so. |
| `estimate` | 3,386 | Computed. An estimate. |
| `verified` | 380 | Checked against a live source. |

The number that `npm run eval` and the operations screen read comes from
`lib/data/ananta/records.ts`. The numbers in this table were produced by
iterating `anantaRecords` and are reproducible with a ten-line script.

`sourceUrl` is `string | null` and is never a placeholder. There is not one
`example.com` in the repository, and a test asserts it.

## Network dependencies

Three third parties, all of them public, key-free, and optional.

| Host | Used by | What for | When it fails |
|---|---|---|---|
| `routing.openstreetmap.de`, `router.project-osrm.org` | `lib/routing.ts` | Street routes for the map | A labelled straight-line estimate |
| `tiles.openfreemap.org` | `components/map.tsx` | Map style and tiles | A visible map error state |
| `commons.wikimedia.org`, `i.ytimg.com` | `lib/media.ts` | Area photographs and video thumbnails | A caption that says the media is missing |

A scheduled GitHub Actions workflow re-verifies the Wikimedia and YouTube pools
monthly and weekly. It is the only thing in the repository that writes to the
catalogue automatically, and it pushes only after the dataset tests pass.

## Authentication

**There is none.** No sessions, no tokens, no roles, no authorization, no rate
limiting, no CSRF protection.

`/admin/operations` and `/provider` mutate persistent state with no
authentication. On a device-local demo that is defensible. **On a public URL it
is not**, and nothing should be deployed publicly without reading
`docs/06-quality/ACCEPTANCE-CRITERIA.md` first. Both pages say so in the open.

## What the server sends

Six headers on every route, configured in `next.config.mjs`:

| Header | Value | Why |
|---|---|---|
| `X-Frame-Options` | `DENY` | Nothing may frame this app |
| `X-Content-Type-Options` | `nosniff` | No MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Leaks nothing to third parties beyond the origin |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HTTPS only for two years |
| `Permissions-Policy` | camera, microphone, payment and usb all off; geolocation self only | The app uses none of them |
| `Content-Security-Policy` | See below | The only defence against an injected origin |

`X-Powered-By` is disabled, so the stack is not announced.

The CSP is written against what the app actually does, not against a template:
`connect-src` names only the four hosts in the table above, `frame-src` names
YouTube because an experience page embeds a player, and `blob:` is allowed for
the MapLibre worker. `object-src 'none'`, `base-uri 'self'`, `form-action
'self'` and `frame-ancestors 'none'` are all set. `'unsafe-inline'` is present in
`script-src` because Next.js App Router injects inline bootstrap scripts and
there is no server to mint a per-request nonce; `'unsafe-eval'` is present only
outside production. In exchange, the one `innerHTML` sink the app had, popup HTML
built from venue names in `components/map.tsx`, was replaced with
`setDOMContent`, which is what makes the policy worth having.

## Persistence

`localStorage`, keys prefixed `ananta-`, no exceptions:

| Key | What it holds |
|---|---|
| `ananta-draft-plan` | The traveller's hand-picked stops |
| `ananta-saved` | Saved places |
| `ananta-provider-listings` | Provider listings, including published submissions |
| `ananta-requests` | The provider request inbox |
| `ananta-operations` | The operator review queue |
| `ananta-demand-rows` | The persisted rejection stream, which is the provider flywheel's only data source |
| `ananta-stale-ids` | Records an operator marked stale |
| `ananta-reports`, `ananta-media-records` | Incorrect-information reports and media review state |
| `ananta-learner` | The Thompson-sampling state, so learned weights survive a reload |

Clearing site data clears all of it. That is the whole persistence story.

## Things that are deliberately absent

No payments, no commission, no payouts, no disputes. Requests, not transactions.
No PostgreSQL, no Redis, no vector database, no message queue, no Python service,
no embedding model, no reranker, no learning-to-rank, no gamification, no
authentication, and zero new runtime dependencies beyond the five in
`package.json`. CI asserts the dependency set has not changed.
