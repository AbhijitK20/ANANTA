# SESSION 1 of 10 — Contracts, Types, and the No-Model Guard

> Copy everything below this line into a new session.

---

You are session 1 of 10 working simultaneously on **ANANTA**, a fit-first local
discovery engine at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

## Read first, in this order

1. `MASTERPLAN.md` — the final plan. Sections 1 (reconciliation), 3 (pipeline) and
   8 (task map) are the ones that matter to you.
2. `SESSION/00-CONTRACTS.md` — **the frozen contract.** Sections 0 (three rules), 2
   (frozen types), 4 (frozen signatures), 5 (rejection code discipline) and 8
   (blocker protocol) are binding on you.
3. Skim `lib/seed.ts` (the current `Experience` type, 27 fields) and
   `lib/data/index.ts` and `lib/data/factory.ts` so you know what the new type has
   to be a superset of.

## Why you go first

Nine other sessions are running right now, at the same time, in the same working
tree. They are reading `SESSION/00-CONTRACTS.md` and coding against the types
written there. They cannot see your code. They do not need to. **Your job is to
make the contract real, compile-clean, and honest, and to build the one guard that
keeps the project's central architectural claim true.**

## ALLOWED — you own these files, exclusively

```
lib/engine/contracts/types.ts
lib/engine/contracts/codes.ts
lib/engine/contracts/manifest.ts
lib/engine/contracts/index.ts
lib/engine/objective-spec.md
lib/engine/index.ts
lib/engine/guard/no-model.test.ts
lib/engine/guard/no-legacy-names.test.ts
SESSION/BLOCKERS/1.md
```

## FORBIDDEN — do not create, do not edit, do not "just fix"

```
lib/seed.ts               frozen, everyone reads it
lib/data/**               owned by session 8
lib/engine/retrieve/**    session 2
lib/engine/feasibility/** session 3
lib/engine/scoring/**     session 4
lib/engine/packing/**     session 5
lib/engine/validation/**  session 6
lib/engine/replan/**      session 7
lib/engine/eval/**        session 10
app/**  components/**     session 9 (app/provider and app/admin are session 10)
docs/**  .github/**  scripts/**  package.json  tsconfig.json  .eslintrc.json
vitest.config.ts  next.config.mjs  .env.example
```

Nine other sessions are editing in this tree. Every file above is being edited
right now by someone else. Touching one means a lost edit and a broken typecheck
for a stranger.

## Task

### 1. `lib/engine/contracts/types.ts`

Transcribe the frozen types from `SESSION/00-CONTRACTS.md` section 2 **verbatim**.
Every interface, every union, every field name and every comment. These are load
bearing: nine sessions are typing against them as you write. Do not rename
anything. Do not "improve" a type. Do not make a field optional because it would be
convenient for your own code. If you believe a type is wrong, that is a blocker
entry, not an edit.

The only additions you are permitted:

- `import type { Experience } from "@/lib/seed";` at the top, used by
  `ExperienceV2`'s doc comment or a `LegacyExperience` alias if useful.
- Module-level constant arrays for the unions that need runtime iteration
  (`REJECTION_CODES_LIST`, `PROVENANCE_VALUES`, `ACCESS_NEEDS`, `DIET_NEEDS`,
  `COMPONENT_IDS`). Export them. Runtime arrays cannot live in a type-only file
  that other sessions import with `import type`, so put the values here and the
  shapes here too.

### 2. `lib/engine/contracts/codes.ts`

The single source of every rejection sentence in the product.

- `REJECTION_CODES: Record<RejectionCode, CodeSpec>` with an entry for all 30
  codes. Not 20. All of them, so that session 3 never has to invent one and so that
  a test can prove the enum and the table are the same size.
- `advisory: true` only for `hours_unverified`, `unverified_required_fact`,
  `requires_booking_not_available`. Everything else is blocking. Get this right:
  it is the difference between "we refused you" and "we are unsure about this one".
- Sentence builders that read like a competent colleague, with real numbers.
  Examples of the required register:
  - `too_far` → `"42 min away by taxi; your limit is 25 min."`
  - `travel_time_exceeds_budget` → `"Needs 40 min more travel than you have left."`
  - `over_budget` → `"Costs about 900 for 4 people; your budget is 600."`
  - `capacity_exceeded` → `"Seats 3; you are 4."`
  - `hours_unverified` → `"Opening hours are unverified, so we will not claim it is open."`
  - `not_step_free` → `"Has steps at the entrance and no step-free route is recorded."`
  - `seasonal_mismatch` → `"Best from June to September; it is October."`
  - `lead_time_too_short` → `"Needs 24 h notice; you are planning 3 h ahead."`
  - `duplicate` → `"Already 2 stops are within 300 m of this one."`
- Every builder must be **total**: given no shortfall it still returns a finished,
  truthful sentence that does not invent a number.
- `REJECTION_UNIT_LABEL` and `REJECTION_UNIT_SUFFIX`. The suffix is the trailing
  token: `minutes → "min"`, `inr → ""` (the rupee sign goes in front, in the
  sentence), `km → "km"`, `metres → "m"`, `seats → "seats"`, `days → "days"`,
  `none → ""`.
- House style, and a test will check it: **no em dash character (U+2014) anywhere
  in this file.** No emoji. No sentence containing "constraint violated", "not
  eligible", or a bare "unavailable".

### 3. `lib/engine/contracts/manifest.ts`

- `MUMBAI_MANIFEST` and `NAVI_MUMBAI_MANIFEST` as `CityManifest`.
- `CITY_MANIFESTS: Record<string, CityManifest>` keyed by `"mumbai"` and
  `"navi-mumbai"`.
- `getCityManifest(id)` that throws a clear error on an unknown id.
- Source the `neighbourhoods` array from the **real, already-verified** table in
  `lib/data/zones.ts` (`zoneRows`, 23 rows). Import it as a type-only read or copy
  the values; either way the anchors must be the real coordinates already in the
  repo, not invented ones. `zones.ts` has no `Breach Candy` row, which is a known
  session 8 bug. Add `Breach Candy` to your manifests so the engine has a home for
  it even before the data lands, and note it in your blockers file.
- `congestion` multipliers per `TravelMode`, labelled in `notes` as estimates. Use
  defensible Mumbai values and say so in the note: walking 1.0, metro roughly 1.15
  because of last-mile, taxi roughly 1.9 in peak and you can express that as a
  single average plus a note, ferry 1.0. These are estimates. The `notes` field is
  where the product tells the traveller that.
- `monsoonMonths: [6, 7, 8, 9]` for Mumbai. This is the input to
  `seasonal_mismatch`, so getting it right is what stops the current bug where
  `lib/recommendation.ts:45` rejects a bird-watching point for rain when the real
  problem is that flamingos are seasonal.
- `ferryCorridors`: the real Nerul, Seawoods and Belapur ferry links, with
  durations. `zones.ts` has `Nerul/Seawoods` and `Belapur` as areas.
- **Zero Mumbai-specific logic in this file beyond manifest data.** No
  `if (city === "mumbai")` anywhere. Manifests hold values; code reads them.

### 4. `lib/engine/objective-spec.md`

Prose spec of the objective from `SESSION/00-CONTRACTS.md` section 3, expanded so
sessions 4 and 6 can implement against the same document without ever reading each
other's code. Include: the formula, the normalisation range of every term, the
purity rules and why each one exists, the exact Wilson lower bound formula with its
z value, the `superlinearTravel` quadratic and the 8 km constant, the
`redundancyPenalty` pair count, the `paceDeviation` exponent. State clearly that
`objectiveFast` and `objectiveNaive` share no code, and that this is the entire
point of the 1e-6 bound.

### 5. `lib/engine/index.ts` — the single public barrel

Re-export the contracts, and re-export each stage's public API **as declared in
`SESSION/00-CONTRACTS.md` section 4**. The stage directories do not exist yet, so
this will not compile on your first run. Write it anyway, and leave it as the last
step. Because you cannot import what does not exist, do this instead: create
`lib/engine/index.ts` exporting the contracts now, and add a clearly marked block
at the bottom for the stage re-exports, to be enabled once the stages land. Comment
it with which session owns each line. Do not create placeholder stage files to make
it compile; that would collide with nine sessions.

### 6. `lib/engine/guard/no-model.test.ts` — the credibility anchor

This is the most important test in the repository. It is what turns "the LLM never
decides" from a claim in a readme into a machine-checked invariant.

Write a test that:

- Walks `lib/engine/**` and `lib/**` (the pure logic layer) using `node:fs` and
  `node:path`, resolved from `process.cwd()`. No glob dependency.
- Parses every `import` / `export ... from` / `require(` source specifier with a
  regex. No TypeScript compiler API, no dependency.
- Fails if any file in `lib/engine/` imports: `openai`, `@anthropic-ai/sdk`,
  `anthropic`, `@google/generative-ai`, `@google/genai`, `langchain`, `@langchain/*`,
  `llamaindex`, `ollama`, `ai`, `@ai-sdk/*`, `cohere-ai`, `groq-sdk`, `mistralai`,
  `replicate`, `@huggingface/inference`, `ollama`, or any specifier matching
  `/^(ai|llm|model)/i`.
- Fails if any file in `lib/engine/` contains a `fetch(` or `https.request(` whose
  first argument is not an allowlisted routing host. Allowlist exactly:
  `router.project-osrm.org`, `routing.openstreetmap.de`. Everything else fails,
  including a bare `fetch("/api/...")`, because the engine must be pure.
- Fails if any file in `lib/engine/` references `Date.now`, `new Date()` with no
  argument, `Math.random`, or `crypto.getRandomValues` outside of
  `scoring/thompson.ts` where the RNG is explicitly injected. The purity rules are
  what make the 1e-6 drift bound achievable, so an unguarded clock in the engine
  is a genuine regression, not a style issue.
- Has a **positive control**: assert that a fixture string containing `openai`
  *would* be caught. A guard test that cannot fail is worse than no guard test.
  Put the fixture inline as a string, do not write a temp file.
- Asserts the real engine directories are non-empty, so the guard cannot pass
  vacuously on an empty tree.

Name the failures well. When this test fails in six months, the message must tell
the next person exactly which file, which line, which import, and which principle
from `MASTERPLAN.md` section 8 it violates.

### 7. `lib/engine/guard/no-legacy-names.test.ts`

The product is **ANANATA**. The strings `TravelBuddy`, `Athiti`, `Local Tourist`
and `Local & Experiences` must not appear anywhere in `app/`, `components/`,
`lib/`, `docs/`, `scripts/`, `.github/`, or any config file. Case-insensitive.

This is not cosmetic. `Local-Experiences-Masterplan.md` is 2198 lines containing
zero occurrences of the current product name, and `.env.example` line 1 still
ships `NEXT_PUBLIC_APP_NAME=Local Tourist`. A judge reads one line of config and
concludes the project has no name.

Allow exactly one exemption: the body of this test file, which must contain the
banned strings as data. Exclude the file from its own scan by absolute path.

## Constraints

- **Zero new dependencies.** `package.json` is frozen and owned by session 10.
- `lib/seed.ts` is read-only. `ExperienceV2` is a superset, not a replacement.
- No em dash character (U+2014) and no emoji in any file you write, including
  comments. `docs/05-design/DESIGN-CONTRACT.md` bans them in five documents and the
  current codebase violates that in four shipped strings.
- Comment sparingly. A comment that explains *why* is welcome. A comment that
  restates the code is noise.

## Verification, before you report done

```
npm ci
npx tsc --noEmit
npm run lint
npx vitest run lib/engine/contracts lib/engine/guard
```

Then confirm your blast radius is clean:

```
git status --short
```

Every path listed must be on your `ALLOWED` list. If `git status` shows a file you
did not write, another session is mid-flight; leave it alone and note it in
`SESSION/BLOCKERS/1.md`.

Expected state: the guard tests pass, `tsc` is clean for `lib/engine/contracts`,
and `lib/engine/index.ts` exports the contracts with the stage re-exports present
but commented.

## Definition of done

1. All 30 rejection codes have a `CodeSpec`, and a test asserts the table size
   equals the union size, so a future added code without a sentence fails the build.
2. `MUMBAI_MANIFEST.neighbourhoods` contains the 23 real anchors from `zones.ts`
   plus `Breach Candy`.
3. `no-model.test.ts` passes, and its positive control proves it can fail.
4. `no-legacy-names.test.ts` passes on the current tree. **If it fails, do not edit
   the offending file.** Report every hit in `SESSION/BLOCKERS/1.md` with path and
   line, grouped by owning session. Session 9 and session 10 will fix their own.
5. `objective-spec.md` is specific enough that sessions 4 and 6 could implement
   against it having never spoken to each other. That is the real test of it.
