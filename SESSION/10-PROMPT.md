# SESSION 10 of 10 — Provider Flywheel, Eval Harness, CI, and Documentation

> Copy everything below this line into a new session.

---

You are session 10 of 10 working simultaneously on **ANANTA**, a fit-first local
discovery engine at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You own three things: **the economic loop**, **the measurement of everything**, and
**the honesty of the repository**. The third one is worth more than the other two
combined in a hackathon, and it is almost entirely deletions.

## Read first

1. `MASTERPLAN.md` sections 7, 9, 11 and 12. Section 12 is your section.
2. `SESSION/00-CONTRACTS.md` **completely**. Section 4 has your `eval` signatures.
3. `app/provider/page.tsx`, `app/admin/operations/page.tsx`, `lib/provider.ts`,
   `lib/operations.ts`, `lib/alerts.ts`, `lib/media-store.ts`, `lib/reports.ts`,
   `lib/saved.ts`, `lib/media.ts`.
4. `docs/06-quality/ACCEPTANCE-CRITERIA.md` (30 criteria, 0 automated),
   `docs/06-quality/TEST-PLAN.md`, `docs/06-quality/DEFINITION-OF-DONE.md`,
   `docs/06-quality/ITERATIVE-BROWSER-QA.md`, `docs/03-technical/*`,
   `docs/02-planning/DECISION-LOG.md`, `docs/01-product/*`, `docs/04-data/*`,
   `docs/05-design/*`, `README.md`, `.env.example`, `Local-Experiences-Masterplan.md`.
5. `.github/workflows/ci.yml`, `refresh-media.yml`, `refresh-geocode.yml`,
   `.eslintrc.json`, `vitest.config.ts`, `tsconfig.json`, `next.config.mjs`,
   `vercel.json`, `scripts/qa-browser-pass.mjs`, `scripts/qa-audit-fixes.mjs`.

## Part 1 — The provider flywheel, and the loop that is severed

The problem statement's supply side is currently unbuilt end to end.

**What exists.** `app/provider/page.tsx` is 98 lines with 2 seeded listings
(`lib/provider.ts:12-15`). There is a real form at `:92` and a real availability
editor at `:98` writing through `writeProviderListings` at `:81-86`. That is the
**only real cross-surface data flow in the entire application**: setting
`matunga-breakfast-trail` or `vashi-market-loop` to Closed propagates through
`lib/provider.ts:35` to `lib/recommendation.ts:46`, hard-excluding it from Explore,
and to `lib/adapt.ts:24`, triggering a replacement suggestion on Trips. Genuinely
wired, and worth keeping.

**What is missing, and it is the masterplan's central economic claim.**

- **No request inbox.** Zero code. A provider cannot see, accept or decline
  anything.
- **No unmet-demand feed.** Zero code. And the critical detail:
  **nothing anywhere logs a search.** The complete set of `localStorage.setItem`
  calls is plan, saved, reports, operations, provider-listings, media-records and
  two sessionStorage route caches. The `result.excluded` array that the whole
  flywheel depends on is computed in memory at `app/explore/page.tsx:94` and
  **discarded on navigation**. The feed has no data source because no data source
  was ever created.
  Note `lib/alerts.ts:17` declares an `unusedSlots` field with a full alert branch
  at `:48-51` that no caller ever supplies: dead scaffolding for this feature.
- **No publish path, and this is where the loop is severed.** The provider page
  promises at `:93` "an admin must verify it before publishing" and "becomes a real
  discovery signal once an admin publishes the listing". Submissions *do* land in
  the operations queue via `:67-76`, but the admin page at
  `app/admin/operations/page.tsx:67` offers only "Verify" and "Mark stale", which
  set a **status string that nothing in discovery ever reads**. There is no publish
  action, no listing queue, no link from the admin page to submissions. A submitted
  listing stays invisible to Explore forever. **An operator can "verify" 1000
  records and not one traveller-facing signal changes.** The admin page even claims
  Stale means "Remove from ranking until checked", which is false.
- **The form's price and duration are silently discarded.**
  `app/provider/page.tsx:52-63` reads only `name`, `area`, `category` and `source`.
  The `price` and `duration` inputs at `:92` are `required`, browser-validated,
  shown to the user, and then thrown away. Submissions get `id: draft-${Date.now()}`
  and are not in `allExperiences`, so they are invisible forever.
- **Demand numbers are invented.** `:25-37` counts saves and inflates to a floor of
  4 at `:31` with `Math.max(counts[listing.id], 4)`, deliberately tripping the
  `saves >= 3` threshold at `lib/alerts.ts:45`. That is fabricated data wearing a
  real-looking number, and it is exactly the kind of thing this product exists to
  avoid.
- `const TODAY = "2026-09-09"` at `:11`. The freshness alerts at `lib/alerts.ts:30-37`
  are computed against a frozen date, so they are decorative.

**Your Part 1 deliverables.**

1. `lib/eval/unmet-demand.ts`: `unmetDemandFromStream(stream, records, ctx)`.
   Consume session 3's `GateResult.stream` verbatim, which is why session 3 was told
   to emit every rejection rather than a sample. Group by a stable
   `fingerprint` of area plus interest so repeats collapse, and compute
   `demandCount`, `dominantRejection`, the full `rejectionMix`, and
   `medianShortfall`. **Persist the stream.** This is the missing data source:
   wherever the UI calls the gate, the rejections go to a store. That store is the
   flywheel.
2. A request inbox: open, accepted, declined, with a response timestamp. Requests,
   not transactions. No payments, no commission, no disputes, per the masterplan's
   non-goals.
3. **A publish action that actually inserts into the discoverable catalogue.** The
   admin publishes a submission, and Explore can then return it. This is the single
   change that turns the provider side from a form into a loop, so it is the
   highest-value item in this section.
4. Make "Stale" mean what the tooltip claims, or delete the claim. `Evaluate` and
   `statusTone` on real records must actually feed `gate()`. Session 8 owns
   `statusTone`; coordinate through the contracts file, and if the wiring needs a
   field you do not own, write it in your blockers file with the exact diff you want.
5. Delete `Math.max(counts[listing.id], 4)`. If there are no saves, show zero.
6. Honour the submitted price and duration, or remove the inputs. A required field
   that is silently discarded is a bug that costs a user's trust.
7. Replace the frozen `TODAY` with a passed-in date.

## Part 2 — The eval harness

`MASTERPLAN.md` section 9 is the success criteria table and it is currently
unmeasured. `PRD.md:163` promises "at least 80% of demo recommendation plans satisfy
hard constraints" and **nothing measures it**. There is no analytics module, no
north-star metric, no coverage number.

`lib/eval/scenarios.ts` must define at least 20 `EvalScenario` entries that read
like things a traveller actually said, covering: a family with a toddler in the
rain; an older relative needing step-free access; a 45-minute window; a tight
budget; a sold-out slot; a lost-hour replan; a Navi Mumbai ferry itinerary; a
budget cut; a dietary constraint; a rest stop needed; someone tired. Include the
`thenTrigger` field for the adaptive ones, so replan swaps get measured and not just
claimed.

`lib/eval/harness.ts` runs retrieve to gate to score to pack to validate to relax,
then computes every metric in section 9: coverage, satisfaction rate, objective
drift, time utilisation, median travel per stop, and median swaps. Use session 6's
exported `DRIFT_TOLERANCE` constant rather than a second literal.

`lib/eval/metrics.ts` aggregates into an `EvalReport` and renders a plain-text table
to stdout, because a table nobody reads is not a measurement. `npm run eval` should
print it.

**Hard requirements.**

- **The suite must pass with no network.** The masterplan's last credibility anchor
  is "eval suite passes with LLM off", and the truest version of that is "passes
  with the network cable pulled". Every travel time must come from an injected
  matrix or the honest haversine fallback, never a live OSRM call. Add a test that
  fails if any module reachable from `lib/eval/` references a network host.
- Deterministic. Same input, same report, byte for byte. A flaky eval report is
  worse than none.
- Assert the targets from section 9 as **thresholds in the test suite**, with the
  measured value in the failure message. "Coverage is 0.87, target is 0.90" is
  actionable. A report nobody asserts against is a blog post.

## Part 3 — Calibration, which is the highest-value work in this session

The repository documents a product roughly ten times larger than what exists. Fixing
this requires **no product code at all**.

Specific, verified overclaims to correct:

1. **`docs/03-technical/API-SPEC.md:13-47` documents 23 endpoints.** There are zero
   `route.ts` files in the repo. Retitle it as proposed and not implemented, or
   archive it.
2. **`docs/03-technical/ARCHITECTURE.md:8-18` draws an API layer and a PostgreSQL
   box. `DATA-MODEL.md:5-138` specifies 14 entities.** The code has one record type
   and three event literals. Write `docs/03-technical/ARCHITECTURE-ACTUAL.md`: 13
   routes, 0 API routes, 0 auth, `localStorage` under `ananta-*` keys, 15 pure lib
   modules, OSRM and Overpass and Wikimedia as the only network dependencies, no
   backend **by decision**. Then repoint every doc at it.
3. **`Local-Experiences-Masterplan.md` is 2198 lines and contains the string
   "Ananta" zero times.** It describes RBAC, Kafka-era ML infrastructure,
   monetisation and a LLM intent parser. `docs/README.md:53` links it as "Source of
   Context". Move it to `docs/99-archive/` with a one-line banner. Keep the
   thinking, drop the unimplemented diagrams. A judge who opens this file concludes
   the team did not finish, and that single file is the largest credibility risk in
   the repository.
4. **`docs/01-product/PRD.md:158` promises "role-based authorization, validation,
   rate limiting, secure sessions".** There is no auth code, and
   `/admin/operations` and `/provider` mutate persistent state with no
   authentication, no authorization, no rate limiting and no CSRF token. For a
   device-local demo that is defensible. **Saying which it is, in the docs and in
   the UI, is mandatory.** A public deployment is not, and nothing in the repo
   currently says so.
5. **Six different dataset numbers across one file.** `ITERATIVE-BROWSER-QA.md`
   says 31 at `:270`, 40 at `:304`, 43 at `:348`, 506 geocoded at `:330`, and 1104
   at `:336`. `MVP-SCOPE.md:81` says 150 to 300. `DECISION-LOG.md:113` says 1100+.
   The truth is in session 8's output; take their numbers and state the composition
   in **one** place: hand-curated count, generated count, real-OSM-pin count,
   estimated-field count.
6. **`ITERATIVE-BROWSER-QA.md:127` says Chromium is not installed. `:166` says it
   now is.** Both are in the file. Delete or reconcile. Same for the "the
   task/session summary" reference at `:158`, which does not exist.
7. **`DECISION-LOG.md:85` (DEC-014) says "routing remains future work"** while
   DEC-016 at `:93-95` documents real OSRM routing shipping, which it did, in
   `lib/routing.ts`. Amend DEC-014. Also `DEC-018` at `:99` is printed before
   `DEC-017` at `:105`. Also `DEC-004` at `:21-25` says hard constraints are applied
   in "**backend** logic", and there is no backend; the spirit holds in `lib/`, fix
   the word. Also `DEC-013` at `:75-79` says the product is renamed everywhere, and
   `PRD.md:5`, `PROJECT-TOOLS.md:5` and `.env.example:1` still say otherwise.
8. **`.env.example` lists ten variables and nine are read by nothing**:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `AI_API_KEY`, `ROUTING_API_KEY`,
   `GEOCODING_API_KEY`, `WEATHER_API_KEY`, `YOUTUBE_API_KEY` and
   `NEXT_PUBLIC_APP_NAME` (which is set to `Local Tourist`, a name from before the
   rename, on line 1, which is the first thing a judge reads after the README).
   Only `NEXT_PUBLIC_MAP_STYLE_URL` is used, at `components/map.tsx:30`. Delete the
   other nine. A `SUPABASE_SERVICE_ROLE_KEY` in a `.env.example` on a public
   hackathon repo is a bad signal regardless of whether it is a placeholder.
9. **The masterplan's no-LLM principle is enforced by nothing.** `.eslintrc.json` is
   three lines of stock config. Session 1 adds a test that walks the import graph;
   reinforce it with an ESLint `no-restricted-imports` on the model SDKs for
   `lib/engine/**`, plus a `no-restricted-syntax` rule banning U+2014 and emoji in
   the product copy, which five documents in this repo already mandate and four
   shipped strings currently violate. Check the rule against the tree first: if it
   fires on files session 9 owns that they have not yet fixed, **report it in
   `SESSION/BLOCKERS/10.md` and do not edit their file.**
10. **Rewrite `docs/06-quality/ACCEPTANCE-CRITERIA.md` as a table with a `Status`
    column and an `Enforced by` column.** 30 criteria with 0 automated checks reads
    as a wish list. 30 criteria with 22 verified and 8 honestly marked "not built,
    no data field" reads as engineering. Use the pattern:
    `| # | Criterion | Source | Status | Enforced by |`. A `Status` of
    `verified`, `partial` or `not built, no data field`, and `Enforced by` naming a
    test file and line, or a dash.
11. **Add the missing decisions to the log.** The two most load-bearing decisions in
    the repository are undocumented: no backend, `localStorage` only; and no model
    in the runtime, regex intent parsing instead of an LLM. Both are **features**
    under the free-first constraint, and both are strong answers to the question a
    judge will ask. But right now `DEC-004` and `AI-RECOMMENDATION-DESIGN.md:5`
    imply a model exists somewhere, so a judge goes looking for it and finds
    nothing, which reads as evasion rather than discipline. Say it out loud.
12. **Three overlapping definitions of done**: `DEFINITION-OF-DONE.md:1-19` (14
    clauses), `PRODUCT-BACKLOG.md:64-73` (8), `MVP-SCOPE.md:89-98` (8). Consolidate
    to one and cross-reference it.
13. **`SPRINT-PLAN.md` disagrees with itself.** The per-sprint backlogs at `:29, :39,
    :49, :59, :69` and the "Story Allocation Summary" at `:88-93` allocate US-005
    through US-018 differently. Fix the table against the sections. Add the `Status`
    column it conspicuously lacks.
14. **`docs/01-product/PRD.md:130-145` numbers requirements FR-001 to FR-020, then
    FR-025 to FR-028, then back to FR-021 to FR-024.** Renumber.
15. **`docs/03-technical/ARCHITECTURE.md:114-120` and `DEFINITION-OF-DONE.md:7`
    promise a footer with Privacy, Terms, Contact and Report-incorrect-information.
    No footer exists**, and there is no `/contact` route. Session 9 is adding a
    footer. Add the contact route or remove it from the spec.
16. **`docs/06-quality/ITERATIVE-BROWSER-QA.md` is 356 lines, the longest doc in the
    repo, describing a process nobody can reproduce.** Both QA scripts hardcode
    `require("/home/abhijitk20/plugins/playwright-cli/node_modules")` at line 5,
    and `playwright` is not in `package.json`. Screenshots go to `/tmp`. The dev
    server port is hardcoded to 3117. And the exit gate requires
    `consoleErrors === 0` on pages that call two external OSRM hosts and
    `tiles.openfreemap.org`, so the harness fails 100% of the time under any
    network restriction, regardless of code quality. Three options, pick one and
    commit to it: make it runnable (add `playwright` to devDependencies, resolve
    the module from `process.cwd()`, use `os.tmpdir()`, take the base URL from
    `argv` or `env`, and add one CI job), or relabel the doc as a manual QA log and
    delete the "N/N automated checks" phrasing. **Do not leave it claiming to be an
    automated loop it is not.** Also fix `scripts/qa-audit-fixes.mjs:20-25`, which
    calls `process.exit` before `await browser.close()` and leaks a Chromium process
    on every failure.

## Part 4 — Config, CI, and security headers

You are the **sole owner** of every file in this section. Nobody else may edit them,
which is why this section exists.

1. **`next.config.mjs`, 6 lines with one setting.** Add `poweredByHeader: false`
   (it currently leaks `X-Powered-By: Next.js`) and a `headers()` block with
   `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`,
   `Permissions-Policy`, and a CSP. **The CSP must allow exactly the four origins
   the app actually uses**: the two OSRM hosts from `lib/routing.ts:24`, the map
   style host from `components/map.tsx:30`, and `commons.wikimedia.org` plus
   `i.ytimg.com` for media. MapLibre injects workers and needs `worker-src`, so
   write the policy against what the app does, not against a generic template. This
   requires session 9's `setHTML` escaping to land; if it has not, land the rest of
   the headers, omit the CSP, and note it as blocked with severity `blocker`.
2. **`tsconfig.json`: add `noUncheckedIndexedAccess: true`.** One line, and the
   highest-value config change available, because the codebase is already written
   defensively enough that it will probably pass clean. **Sequence this last, after
   everything else is green.** If it produces more than about twenty errors outside
   your own files, revert it and record it as a follow-up in
   `docs/06-quality/ACCEPTANCE-CRITERIA.md` with the count. Do not leave the tree
   red to look rigorous. Also bump `target` from `es5` to `es2017` to match
   `moduleResolution: "bundler"`.
3. **`.eslintrc.json`, 3 lines of stock config.** Add the model-SDK import ban and
   the em dash and emoji rules described in item 9 above.
4. **`ci.yml`**: add `permissions: contents: read` at the top. The two refresh
   workflows correctly declare `contents: write`; `ci.yml` declares none and
   inherits the repo default. Add a `concurrency` group so the two scheduled jobs
   cannot race each other on `git push` to `lib/data/*.generated.ts`. Add
   `npm run eval` to the pipeline, since a measurement nobody runs is not a
   measurement. Consider a dependency review step.
5. **`package.json`**: add `"eval"`, and a `"verify"` that chains typecheck, lint,
   test, build and eval. **Change nothing else.** Zero new dependencies, and CI
   should assert it, because a diff check on `dependencies` is one line and it locks
   in the masterplan's strongest constraint.
6. **Security posture, stated plainly.** `components/map.tsx:59, 83` interpolate
   record data into `Popup.setHTML()` (session 9 is fixing), and `/provider` plus
   `/admin/operations` mutate persistent state with no auth. For a local demo that
   is fine. **Document it in one place**, in the README and in the UI, so nobody
   deploys this to a public URL believing it is hardened.

## ALLOWED — you own these files, exclusively

```
app/provider/**
app/admin/**
app/terms/**  app/privacy/**
app/contact/**  (new, if you build it)
components/ananta/provider-*.tsx  (co-owned with session 9's namespace, prefix keeps you clear)
lib/eval/**
lib/provider.ts  lib/alerts.ts  lib/operations.ts
package.json  tsconfig.json  .eslintrc.json  vitest.config.ts  next.config.mjs  vercel.json
.env.example  .gitignore
.github/**
scripts/qa-browser-pass.mjs  scripts/qa-audit-fixes.mjs
docs/**
README.md  Local-Experiences-Masterplan.ts -> moved to docs/99-archive/
SESSION/BLOCKERS/10.md
```

## FORBIDDEN

```
lib/seed.ts                        FROZEN
lib/data/**                        session 8
lib/engine/contracts/**             session 1
lib/engine/index.ts                 session 1, the only barrel
lib/engine/{retrieve,feasibility,scoring,packing,validation,replan}/**
app/explore/**  app/trips/**  app/experience/**  app/page.tsx  app/events/**
app/profile/**  app/saved/**  app/layout.tsx  app/globals.css
components/*.tsx                   session 9
SESSION/0*.md  SESSION/1*.md       the contracts and the prompts, do not edit
```

## Sequencing, because you are the last session and everything depends on you

1. **Parts 3 and 4 first.** Documentation, CI and config are entirely within your
   ownership, do not depend on any other session, and are the highest-value work.
   Get them done before you start waiting on anything.
2. **Part 2 second.** Write `scenarios.ts` and `harness.ts` against the frozen
   signatures now. They will typecheck once sessions 1 to 7 land. Report the
   dependency if it has not.
3. **Part 1 last.** The publish path and the demand store need session 3's
   `GateResult.stream` and session 8's records. Write the code against the frozen
   signatures. If a stage has not landed when you finish, say so explicitly in your
   summary with the exact import that is unresolved. **Do not implement a local
   substitute**, because a duplicate of session 3's gate is precisely the failure
   mode this whole plan exists to prevent.
4. **`tsconfig.json` `noUncheckedIndexedAccess` absolutely last**, after the full
   suite is green, and revert rather than leave the tree red.

## Verification

```
npm ci
npx tsc --noEmit
npm run lint
npx vitest run
npm run build
npm run eval
git status --short
```

Every path in `git status` must be on your `ALLOWED` list. Anything else is another
session's in-flight work; leave it and note it.

Paste the **real** output of `npm test` and `npm run eval` in your summary. Do not
claim a green suite you have not seen. If it is red, say so and say whose it is.

## Definition of done

1. An unmet-demand feed that a provider can read, showing what travellers nearby
   searched for, could not get, and **which single constraint killed it**, with the
   full distribution behind it. Backed by a real persisted rejection stream, not by
   the `Math.max(counts, 4)` invention.
2. A request inbox with open, accepted and declined states.
3. **A publish action that makes a submitted listing appear in Explore.** The loop
   is closed. This is the highest-value single item in this session.
4. "Mark stale" does what its tooltip claims, or the tooltip is gone.
5. An eval harness with at least 20 realistic scenarios, asserting every target in
   `MASTERPLAN.md` section 9 as a threshold, printing a table, passing with no
   network, and byte-reproducible across runs.
6. `docs/03-technical/ARCHITECTURE-ACTUAL.md` exists and every other doc points at
   it. `API-SPEC.md` is retitled or archived. `Local-Experiences-Masterplan.md` is
   in `docs/99-archive/` with a banner.
7. `ACCEPTANCE-CRITERIA.md` has a `Status` and an `Enforced by` column, and no
   criterion claims verified without naming the test that verifies it.
8. The dataset number appears in exactly one place, with its composition.
9. `DECISION-LOG.md` gains a "no backend" and a "no model in the runtime" entry,
   and its stale entries are amended.
10. `.env.example` has one variable, not ten, and no service-role key.
11. Security headers in `next.config.mjs`, an ESLint ban on model SDKs in
    `lib/engine/**`, an em dash and emoji rule, and a CI check that dependencies did
    not change.
12. The two QA scripts either run on a clean checkout or are honestly relabelled as
    a manual log.
13. `README.md` answers, in its first screen, what the product is, what state is
    real and what is estimated, how to run it, how to run the eval, and that it has
    no backend and no auth.
