# SESSION 7 of 10 — Why This, Why Not That, and the Plan Controls

> Copy everything below this line into a new session.

---

You are session 7 of 10 in the **UI/UX fix round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You own the explanation layer. The masterplan's thesis is not "AI recommendations",
it is that a recommendation must **fit** and that we **show our work**. You are the
part of the product that makes the second clause visible.

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**. RULE 0, the copy rules in
   section 3, your row in section 6.
2. `SESSION/UI-UX-DESIGN.md` sections 2, 4 and 9. Section 9 is your copy register.
3. `components/ananta/why-this.tsx` (92 lines, ratified and good),
   `why-this-live.tsx` (1967 bytes), `why-not-that.tsx` (134 lines),
   `learning.ts` (221 lines), and the four small controls.
4. `lib/engine/scoring/explain.ts` and `contracts/codes.ts` for the real inputs.
5. `lib/recommendation.test.ts` and `lib/quick-filters.test.ts`, which assert on
   **English prose** rather than a code. Read them so you understand what you are
   replacing.

## ALLOWED — you own these, exclusively

```
components/ananta/why-this.tsx
components/ananta/why-this-live.tsx
components/ananta/why-not-that.tsx
components/ananta/learning.ts
components/plan-button.tsx
components/plan-badge.tsx
components/save-button.tsx
components/share-button.tsx
components/ananta/why/**
UI-UX-Fix-Prompts/BLOCKERS/7.md
```

## FORBIDDEN

```
tailwind.config.ts, app/globals.css, components/ananta/tokens.ts, records.ts, lib/ui-guard/**   session 1
components/ananta/pipeline.ts, use-ananta.ts                                                   session 2
app/layout.tsx, app/page.tsx, app/contact/**, components/footer.tsx, components/ui.tsx         session 3
app/explore/**, components/map.tsx, discovery-search.tsx, travel-options.tsx                     session 4
app/trips/**, components/ananta/feasibility-meter.tsx                                          session 5
app/experience/**, provenance-badge.tsx, experience-media.tsx, report-button.tsx                 session 6
components/ananta/stress-radar.tsx, learned-weights.tsx, app/profile/**, app/saved/**            session 8
components/ananta/replan.ts, replan-proposal.tsx, app/events/**, availability-picker.tsx        session 9
app/provider/**, app/admin/**, app/terms/**, app/privacy/**                                    session 10
lib/**   FROZEN
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, vitest.config.ts, docs/**
```

**Your new components go in `components/ananta/why/`.** That directory is yours alone.

## Task

### 1. `why-this.tsx` is ratified. Two real bugs in it though.

The ranking is correct: it sorts by descending absolute contribution at `:30-32`,
ties break on `id` so it is deterministic, and the overflow count is honest at
`:84-88`. Do not rewrite it.

**Bug 1, `:53-54`:**

```tsx
<p>Objective {total > 0 ? "" : ""}{total.toFixed(3)}</p>
```

That ternary returns an empty string in **both** branches. It is the residue of a
removed sign prefix and it is dead code that a reader will puzzle over. Either
render a signed value or drop the ternary. If a negative objective is meaningful,
show the sign; if it is never negative in practice, say so in a comment.

**Bug 2, the bars are `aria-hidden` and there is no text equivalent.** `:70` marks
the contribution bar `aria-hidden="true"`, which is correct for a decorative bar,
but the sentence at `:76` does not carry the magnitude. A screen-reader user gets
"Interest match" and a sentence with no number, while a sighted user gets a bar
whose length encodes the magnitude. **Put the number in the sentence.** Not in the
`aria-label` of a decorative element, in the text.

Also: `:78` prints "Weight {weight} × normalised {normalised}" using raw
floating-point. `0.3333333333333333` is not a thing a traveller should read.
Format to three decimals, matching the contribution at `:67`.

### 2. `why-this-live.tsx` — find out what this is, then justify it

1967 bytes, created in the last round, and I cannot see its purpose from the name.
Read it and decide: if it duplicates `why-this.tsx`, **delete it**. If it is a
genuine live variant for the explore card, keep it, document in a comment what
distinguishes it, and make sure the two do not drift into showing different numbers
for the same record. Two components rendering the same score differently is the
worst outcome in the explanation layer.

### 3. `why-not-that.tsx` — remove the duplicated map, keep the strength

**`CONFIDENCE_TONE` is defined here at `:16-21` and again in
`components/ananta/provenance-badge.tsx`.** Session 1 is writing
`components/ananta/tokens.ts` in the first 20 minutes of its run. **Delete your
local copy and import from `@/components/ananta/tokens`.** If it is not there yet,
write the import, accept the typecheck error, continue. Do not re-declare the map.
Two definitions of one visual language will drift, and when they do, a rejection and
a badge will disagree about what "unverified" looks like on the same screen.

What is already right and must survive: blocking and advisory separated at `:60-61`
and `:91-108`, the shortfall in the unit the code declares at `:23-29`, the
provenance of the causing fact at `:80-84`, and the cheapest-relaxation block at
`:110-125`. That last one is the best piece of UI in the product: it answers the only
question that matters after a refusal, which is *what would change this*.

Add:
- **Near-misses.** A record that failed by 8 minutes is a different situation from
  one that failed by 90. Rank the rejections by shortfall ascending, so the
  cheapest one is first, and say so: "8 minutes over. Widen by 10 and this fits."
- **The `advisory` framing at `:93` is good.** "Not blocking, but not known either"
  is exactly right. Keep the wording.
- **The `zero rejections` branch at `:44-57` is honest** and names that the record
  was never a candidate. Keep it, and make sure it distinguishes "retrieval never
  returned it" from "the gate dropped it", because those are different failures
  with different fixes.

### 4. `learning.ts` — the persistence layer, read it before you touch it

221 lines, exports `PRIOR_WEIGHTS`, `WEIGHT_IDS`, `WEIGHT_BOUNDS`,
`WEIGHT_MEANING`, `LEARNER_KEY`. It is where the bandit state is persisted, and
`lib/engine/scoring/thompson.ts` is the pure side of it.

**RULE 0 applies with a twist here.** You may not reimplement `sampleWeights` or
`updateBandit`; they live in the engine. What you own is the **storage and the
surface**: reading and writing `BanditState` under `LEARNER_KEY`, handling absence,
and rendering.

The critical behaviour, and it is the trust core of the learned-weights feature:
**nothing is learned without being visible and editable.** A recommendation you
cannot interrogate is just a vibe. So:
- A stored bandit state must never silently change what the UI shows. The panel
  renders the *current* weights, which are derived from the state, and editing one
  writes back through `updateBandit` or an explicit override.
- First visit with no stored state must render `banditFromWeights(PRIOR_WEIGHTS)`,
  not a blank, and must say the weights are a starting point rather than a
  conclusion.
- `LEARNER_KEY` is local storage, so it must degrade safely: a corrupt value, a
  value from an older shape, a quota failure. **Never throw on read.** Fall back to
  the prior and, if you tell the user their history was reset, say why.
- Note that `app/profile/page.tsx:78` currently reads "no behavioral profile is built
  in this prototype." That becomes false the moment a weight is learned. Session 8
  owns that file; write a blocker naming session 8, and do not edit it.

### 5. The four small controls, and one real bug

`plan-button.tsx`, `plan-badge.tsx`, `save-button.tsx`, `share-button.tsx`.

**The add-to-plan bug.** `plan-button.tsx:15` is a real toggle. The Explore card at
`app/explore/page.tsx:240` is add-only, so its label flips to "Added to plan" and
re-clicking rewrites the same array. A user who removes a place on the detail page
and returns to Explore sees "Add to plan" again. **Session 4 owns the Explore card
and will import your `plan-button.tsx`, so make it the single implementation**: a
proper toggle with `aria-pressed`, a label that reflects the real state, and no
local copy of the plan array.

- Every one of these needs a real accessible name and a real state. A pill that says
  "Add to plan" and gives no feedback when it is already added is a state bug.
- `save-button.tsx` writes to `lib/saved.ts`, which feeds the provider demand
  counts. Session 10 owns the display of those counts. **Never inflate them.** A
  save is a save.
- `share-button.tsx` should use the Web Share API where it exists and degrade to a
  copied link, and the copy confirmation must be announced, because a silent
  clipboard write looks like a broken button.
- `plan-badge.tsx` is slotted into `BottomNav`. Keep the slot. It is a count, so
  give it an accessible name that includes the word "plan".

### 6. Copy register

Contracts section 3 and `SESSION/UI-UX-DESIGN.md` section 9. Every sentence you
write must point at a field or a function. "Highly rated by travellers" is banned
because **no rating data exists**. "Verified" is banned as a blanket claim because
roughly 96% of the catalogue is generated. If you cannot source it, delete it.

No em dash. No emoji. No hard-coded dataset number.

## Constraints

- **RULE 0: no engine in the view layer.** `objectiveFast`, `wilsonLowerBound`,
  `sampleWeights`, `updateBandit`, `banditFromWeights`, `COMPONENT_IDS` and
  `REJECTION_CODES` all come from `@/lib/engine`. If something is missing, it is a
  blocker, not a local copy. `lib/ui-guard/no-engine-fork.test.ts` will fail your
  build.
- Zero new dependencies.
- Never throw on a local-storage read.
- Do not edit a page to place your components. Sessions 3 to 6 and 8 to 10 place
  them. Export a clean component and let them import it.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib/ui-guard
npm run dev
```

Then: find a record that was rejected by a small shortfall and confirm the cheapest
one is first and the sentence carries the number. Clear local storage and confirm
the weights panel renders a prior and says so. Corrupt the bandit value by hand in
devtools and confirm the app does not crash.

## Definition of done

1. The dead ternary at `why-this.tsx:53` is gone.
2. Every contribution magnitude is in the **text**, not only in an `aria-hidden` bar.
3. Raw floats are formatted to three decimals everywhere.
4. `why-this-live.tsx` is either justified in a comment or deleted.
5. The duplicated `CONFIDENCE_TONE` is deleted from this file and imported.
6. Rejections are ordered by shortfall ascending, and near-misses are called out.
7. `learning.ts` imports the bandit from the engine and never reimplements it.
8. A corrupt or absent stored state renders the prior and does not throw.
9. `plan-button.tsx` is the single add-to-plan implementation, with `aria-pressed`.
10. All four controls have real accessible names and real state feedback.
11. `git status --short` shows only your nine path patterns.
12. Your summary names every sentence you deleted, and says which page still shows a
    claim you could not source.
