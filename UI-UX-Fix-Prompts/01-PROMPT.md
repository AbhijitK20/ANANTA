# SESSION 1 of 10 — Foundations: Tokens, Type Scale, and the Fork Guard

> Copy everything below this line into a new session.

---

You are session 1 of 10 in the **UI/UX fix round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

**You go first, and nine sessions are blocked on you for the first 20 minutes.**
Write `components/ananta/tokens.ts` before you do anything else. Not after. Not
once you have context. Immediately, from section 2 of the contracts, verbatim.

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` — **completely**. Section 2 is your literal
   deliverable. Section 6 is your ownership row.
2. `SESSION/UI-UX-DESIGN.md` — the full design rationale. Sections 2, 3 and 4 are
   yours.
3. `tailwind.config.ts` and `app/globals.css` (28 and 183 lines).
4. `docs/05-design/DESIGN-CONTRACT.md` and `docs/05-design/ACCESSIBILITY.md`.
5. `components/ananta/records.ts` (385 lines) to see what stats it already exports.

## ALLOWED — you own these, exclusively

```
tailwind.config.ts
app/globals.css
components/ananta/tokens.ts
components/ananta/records.ts
lib/ui-guard/**
UI-UX-Fix-Prompts/BLOCKERS/1.md
```

## FORBIDDEN

```
components/ananta/pipeline.ts, use-ananta.ts        session 2
app/layout.tsx, app/page.tsx, app/contact/**, components/footer.tsx, components/ui.ts.tsx   session 3
app/explore/**, components/map.tsx, discovery-search.tsx, travel-options.tsx   session 4
app/trips/**, components/ananta/feasibility-meter.tsx                        session 5
app/experience/**, provenance-badge.tsx, experience-media.tsx, report-button.tsx          session 6
components/ananta/why-this.tsx, why-this-live.tsx, why-not-that.tsx, learning.ts,
  plan-button.tsx, plan-badge.tsx, save-button.tsx, share-button.tsx          session 7
components/ananta/stress-radar.tsx, learned-weights.tsx, app/profile/**, app/saved/**       session 8
components/ananta/replan.ts, replan-proposal.tsx, app/events/**, availability-picker.tsx   session 9
app/provider/**, app/admin/**, app/terms/**, app/privacy/**                 session 10
lib/seed.ts, lib/engine/**, lib/data/**                                   FROZEN
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, vitest.config.ts, docs/**
```

## Task, in this order

### 1. `components/ananta/tokens.ts` — FIRST. Twenty minutes. Verbatim.

Transcribe section 2 of the contracts file exactly. Every export, every name, every
Tailwind class string. Nine sessions are typing against this as you write. Do not
rename anything, do not "improve" a class string, do not add a helper you find
tempting.

`components/ananta/records.ts` already exports `DATASET_SIZE`, `HAND_WRITTEN`,
`OSM_MATCHED`, `CURATED_CATEGORY_COUNT`, `provenanceSummary`, `anantaRecords`,
`anantaById`, `legacyById`, `freeRecordIds`, `communityRecordIds`. Re-export the
statistics you need through `tokens.ts` so no session reaches into `records.ts`
directly. The point is that **nobody hard-codes a dataset number**, because
`docs/05-design/DESIGN-CONTRACT.md:17-19` bans fake metrics and a judge checks.

### 2. `tailwind.config.ts` — add the scale

Existing colour and shadow tokens are ratified, keep them. Add:

- `fontSize` entries matching `typeScale` exactly: `micro` 11/16, `meta` 12/20,
  `bodySm` 13/20, `body` 15/24, `lead` 17/28, `title` 21/28, `display` 28/34.
- `spacing` additions for 13 and 17 if they are missing, so `p-[13px]` ad-hoc
  strings disappear.
- `borderRadius`: `chip` 2, `input` 4, `card` 6. Keep Tailwind's `full` for dots.
- `zIndex`: `sticky` 10, `dropdown` 20, `popup` 30, `sheet` 40, `skip` 50.
- `transitionDuration`: 100 and 200 only.

Then grep `app/` and `components/` for `text-[13px]`, `text-[17px]`,
`text-[28px]`, `text-[11px]` and replace with the scale classes **in the files you
own only**. Nine other sessions are doing theirs. Report the rest in your blockers
file with exact locations so nobody duplicates the work.

### 3. `app/globals.css` — add the missing primitives

Keep everything that exists. The `:focus-visible` ring at `:152-167` is ratified
and other sessions depend on it. Add:

- `.card` — `bg-white border border-line rounded-md shadow-card`. Every panel in
  `components/ananta/` currently repeats this string inline. Centralise it, then
  note in your blockers file that sessions 3 to 10 may now use `.card`.
- `.chip` — `inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-micro
  font-semibold`.
- `.prose-note` — the standard 12px muted explanatory line. Used in eleven places.
- `.hairline` — `border-t border-line`.
- **A `.sr-only` that already exists at `:168`. Do not duplicate it.**
- **A skip link that already exists at `:133`. Do not duplicate it.**
- Do **not** add a second focus rule. One, at the top level, is correct.
- Confirm the reduced-motion block at `:128-131` still covers anything new.

### 4. `lib/ui-guard/` — the tests that keep the other nine honest

This is the part only you can write, and it is what stops the round from repeating
the failure of the last one.

**`no-engine-fork.test.ts`** — the single most valuable test you write.
`components/ananta/pipeline.ts` currently declares its own `tokenize`,
`buildIndex`, `retrieve`, `gate`, `wilsonLowerBound`, `objectiveFast`, `pack`,
`objectiveNaive`, `validate` and `relax`. That put the project's two independent
objective derivations in the same file, which means the 1e-6 guarantee now measures
a function against its own neighbour, and it hid a whole engine copy outside the
boundary `lib/engine/guard/no-model.test.ts` inspects.

Write a test that:
- Reads the export names from `lib/engine/index.ts`.
- Walks `app/**` and `components/**` with `node:fs`, parsing top-level
  `function`, `const`, and `class` declarations with a regex. No TypeScript
  compiler API, no new dependency.
- Fails if any name exported by the engine is also declared in the view layer.
- **Has a positive control**: an inline fixture string that must be caught, so the
  guard is known to be capable of failing.
- **Is a warning-only list for `components/ananta/pipeline.ts` until session 2
  lands.** Otherwise nine concurrent sessions produce nine red builds. Make it a
  skipped-until-present assertion with a comment naming session 2 as the remover,
  and make it **fully live for every other file in the view layer from the first
  run.** A guard that is soft everywhere is a guard nobody reads.

**`no-legacy-copy.test.ts`** — grep `app/` and `components/` for U+2014, for
emoji in the `U+1F300` to `U+1FAFF` range, and for the four fabricated claims this
codebase shipped: a `2:15 PM`-style clock template, "Selected because it matches the
current interest", "keeps the rest of the plan within the current area", and
`Math.max(counts`. Report, do not auto-fix: those files belong to sessions 3 to 10.

**`a11y-primitives.test.ts`** — assert the ratified primitives still exist and did
not regress: exactly one top-level `:focus-visible` rule, a `.sr-only` class, a
`.skip-link` with a `:focus` reveal, a `prefers-reduced-motion` block, and the four
tailwind colour pairs clearing 4.5:1 with the ratios asserted as numbers, not as
comments.

**`hardcoded-numbers.test.ts`** — assert no file under `app/` or `components/`
contains a bare dataset literal. Flag `1107`, `1084`, `391`, `43`, `1,107`,
`1104` and friends. `records.ts` is the only permitted source. This one is cheap and
it is the difference between a credible number and a number that rots.

### 5. `components/ananta/records.ts` — make it the single source of truth

It already computes the right things. Make sure it exports, in one place, every
number the UI is allowed to show: total records, hand-curated count, OSM-matched
count, curated-category count, and a `provenanceSummary` that counts records **per
knowledge state** so a badge can be generated from data rather than a guess.

Add one export the landing page will want: a `credibilityLine()` returning the
finished sentence for the first screen. Take the numbers from the data, never from
a literal. Session 3 renders it verbatim.

## Constraints

- **Zero new dependencies.** `package.json` is frozen and nobody in this round owns it.
- No em dash (U+2014) and no emoji in anything you write, including tests and
  comments.
- Do not edit a file you do not own, even if it is broken. That is nine other
  people working right now.
- Rule 0 applies to you too: if the engine lacks something, it is a blocker.

## Verification

```bash
npx tsc --noEmit
npm run lint
npx vitest run lib/ui-guard
git status --short
```

`tsc` will show errors from sessions 3 to 10 while they wait on `tokens.ts`. That is
expected. Filter to your own paths.

## Definition of done

1. `components/ananta/tokens.ts` exists with every export from contracts section 2,
   and it was the **first** thing you wrote.
2. `tailwind.config.ts` has the seven-step type scale, and every ad-hoc
   `text-[13px]` in your files is gone.
3. `.card`, `.chip`, `.prose-note`, `.hairline` exist. No duplicated `.sr-only` or
   `.skip-link`.
4. `no-engine-fork.test.ts` passes, its positive control proves it can fail, and it
   is fully live for every view-layer file except `pipeline.ts`.
5. The other three guard tests exist and pass.
6. `records.ts` exports a `credibilityLine()` whose every number comes from data.
7. `git status --short` shows only your six path patterns.
8. Your summary states how many ad-hoc text sizes you found in files you do not own
   and where, so sessions 3 to 10 can pick them up without duplicating a sweep.
