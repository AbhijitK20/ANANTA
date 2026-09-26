---
name: ananta-invariants
description: Non-negotiable engineering invariants for the ANANTA project. Use before writing or editing ANY file under lib/engine/, and whenever you are tempted to add a dependency, a model call, a clock, a random number, or an em dash. Encodes the eight rules that MASTERPLAN.md section 8 calls non-negotiable, plus the file-ownership protocol for the 10 parallel sessions. Triggers on "lib/engine", "add a dependency", "why is the LLM in the engine", "objective drift", "am I allowed to", "which files can I edit".
license: MIT
compatibility: opencode
metadata:
  project: ananta
  scope: engine
---

# ANANTA engine invariants

ANANTA is a **fit-first local discovery engine**. Its entire value is that a
recommendation provably fits, and that we show our work. These rules protect that.
Breaking one does not cause a bug, it causes a lie.

Read `MASTERPLAN.md` section 8 and `SESSION/00-CONTRACTS.md` section 0 before you
touch `lib/engine/`.

---

## 1. No model decides. Ever.

Not in the decision path, not in the explanation path, not "just for enrichment at
runtime". There is no model in ANANTA's runtime, at all, by decision.

**Forbidden anywhere under `lib/engine/`:**

- Imports of `openai`, `@anthropic-ai/sdk`, `anthropic`, `@google/generative-ai`,
  `@google/genai`, `langchain`, `@langchain/*`, `llamaindex`, `ollama`, `ai`,
  `@ai-sdk/*`, `cohere-ai`, `groq-sdk`, `mistralai`, `replicate`,
  `@huggingface/inference`, or any specifier matching `/^(ai|llm|model)/i`.
- `fetch(` or `https.request(` to any host other than `router.project-osrm.org`
  and `routing.openstreetmap.de`.
- A bare `fetch("/api/...")`. The engine is pure. It has no server to call.

The rationale, when someone asks why: the eval suite passes with no network, and
that is the credibility anchor. A rule you cannot state as a passing test is a
promise, not an architecture.

Session 1's `lib/engine/guard/no-model.test.ts` walks the import graph and fails the
build on any of the above. If it fires, do not add an exception. Restructure.

## 2. Zero new dependencies

`package.json` dependencies are frozen at exactly:

```
@phosphor-icons/react  maplibre-gl  next  react  react-dom
```

Everything the engine needs is implementable from those plus the standard library,
and each was implemented that way on purpose:

| Need | Not used | Used instead |
|---|---|---|
| Search index | `better-sqlite3`, FTS5, Orama | BM25 in memory, ~150 lines |
| Constraint solving | `z3-solver` | named relaxation ladder |
| Routing | OR-Tools, WASM solver | clique peel + 2-opt + Or-opt + LAHC |
| Vectors | `pgvector`, an embedding model | interpretable features |
| Validation | a model as judge | a second, naive, hand-written derivation |
| Learning | LightGBM, CatBoost | Thompson sampling on ~10 weights |

If you believe you need a package, you are wrong. Write the thirty lines.

## 3. Purity, because the 1e-6 bound depends on it

Session 4 writes `objectiveFast`. Session 6 independently writes `objectiveNaive`
sharing **no code** with it. They must agree to `1e-6`. That agreement is the single
most important claim in the project.

Purity is what makes it achievable. Under `lib/engine/`:

- **No `Date.now()`.** No argument-less `new Date()`. Time arrives as `ctx.now`.
- **No `Math.random()`.** No `crypto.getRandomValues`. Inject an `rng` parameter.
  The one legal exception is `scoring/thompson.ts`, which should still take an
  injected seeded LCG rather than calling it.
- **No dependence on `Set` or `Map` iteration order.** Sort before iterating.
  Always.
- **Index-ordered accumulation.** Build a per-stop array, then reduce in index
  order. Never fold into a running accumulator across a `for...of` over a `Set`.
- **No module-level mutable state.** No memo keyed on anything but a pure function
  of the input.
- **No `fs`, no `Date` parsing of the ambient clock, no `localStorage`.**

Every one of these has produced a real bug in a real optimizer. None of them is a
style preference.

## 4. No city string in the engine

Zero occurrences of `Mumbai`, `Navi`, `Fort`, `Colaba`, `Kharghar`, `Marine Drive`,
`INR`-as-a-magic-number, or any neighbourhood name anywhere under `lib/engine/`.

City knowledge lives in `CityManifest` (`contracts/manifest.ts`) and is read at
runtime. The engine is city-agnostic by construction, and a grep test keeps it
that way. If you need a Mumbai value, add it to the manifest.

The single exception is a **test fixture**. Even there, prefer a synthetic manifest,
because a fixture named `kharghar-hills` teaches the next reader that Kharghar is
special.

## 5. A rejection is a feature, not an error

Every record that does not fit carries a typed `Rejection`:

```ts
{ code, sentence, shortfall, unit, blocking, causedBy, causedByConfidence }
```

- **Every sentence comes from `REJECTION_CODES` in `contracts/codes.ts`.** No stage
  module writes an English literal for a rejection. Not one.
- Every sentence is **finished** and carries **real numbers**: "Needs 40 min more
  than you have left", never "constraint violated".
- `shortfall` is always positive, always in `unit`. `unit: "none"` implies
  `shortfall: null`.
- A rejection the engine cannot state in a sentence is a bug in the engine, not a
  limitation of the data.

Two rejections exist because abstaining is correct, and they are **advisory, not
blocking**: `hours_unverified` and `unverified_required_fact`. When a fact is
unknown, the honest output is "we will not claim this fits", never a guess.

## 6. Never replace the traveller's intent

`DiscoveryContext.original` is deep-frozen at construction and is **never
replaced**, only read. Every replan diffs against `original`, never against the
last mutation.

`cloneForMutation` is the only way to derive a new context, and it copies the
frozen `original` by reference, not by value. A shallow copy is not enough:
`profile.weights` is nested, and a shallow copy lets a weight edit mutate the
original.

When the world changes, the **context** changes. The traveller's stated `avoid`
list does not. It started raining; the traveller did not decide they hate rain.

## 7. Product copy: no em dash, no emoji

U+2014 and emoji are banned in every user-facing string and every comment. Five
documents in this repo say so (`docs/05-design/DESIGN-CONTRACT.md:28`,
`CONTENT-STYLE-GUIDE.md:16`, `DESIGN-REVIEW-CHECKLIST.md:21`,
`DEFINITION-OF-DONE.md:18`) and four shipped strings violated it before session 10
added the lint rule.

Use a full stop, a colon, or parentheses. Not a dash of any kind.

## 8. You own a file list

Ten sessions run simultaneously in one working tree. Your `ALLOWED` list in your
prompt is **exhaustive**.

- A file not on it is being edited right now by someone else.
- `lib/seed.ts` is **frozen**. Everyone reads it, nobody edits it. The richer
  `ExperienceV2` lives beside it.
- `package.json`, `tsconfig.json`, `.eslintrc.json`, `vitest.config.ts` and
  `next.config.mjs` have **one owner**, session 10.
- `lib/engine/index.ts` is the only barrel and session 1 owns it.
- If you need a symbol on a file you do not own, append to
  `SESSION/BLOCKERS/<your session number>.md` with the exact diff you want. Do not
  create a local substitute. Ten local shims is how ten sessions end up with ten
  divergent copies of one idea.

---

## Before you report done

```bash
npx tsc --noEmit        # filter to your own paths; others are in flight
npm run lint
npx vitest run <your paths>
git status --short      # every path must be on your ALLOWED list
```

`git status` showing a file you did not write means you touched something you do
not own. Revert it and write a blocker entry instead.
