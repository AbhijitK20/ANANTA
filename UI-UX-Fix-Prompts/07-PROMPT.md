# SESSION 7 of 10 — Why This, Why Not That, and the Plan Controls

> Copy everything below this line into a new session.

---

You are session 7 of 10 in the **spatial UI round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You own the explanation layer, and you own the decision about whether contribution
magnitude becomes depth. **Read that carefully, because the research says no.**

## The decision you have to make, and the research behind it

It is tempting to encode a score component's contribution as `translateZ`, so the
biggest reason a place was chosen stands proud. **Do not do it.**

The CHI 2026 D-MO work states the general problem: perspective projection affects
apparent size, so a mark becomes ambiguous between "small value" and "far away", and
*"introducing depth as a visual channel comes at the cost of ambiguity in size which
is one of the few visual channels effective at conveying quantity."* Munzner's
taxonomy ranks depth below 2D size and explicitly discourages it for data that is
not inherently three-dimensional.

A contribution score is not inherently three-dimensional. **Encoding it as depth
makes the reader unable to tell a small contribution that is far away from a large
one that is close, which destroys the exact information this component exists to
convey.**

So: **contribution magnitude is bar length and a number. It is never depth.**
Depth on this screen is reserved for status: a component that was skipped because
its fact was unverified is `depth-recessed`; a component computed from verified
facts is `depth-raised`. That is the one thing depth is good at here.

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**. Section 0 is the ruling
   above in brief, section 6 encoding 2 is yours, section 3 is your copy rules.
2. `SESSION/UI-UX-DESIGN.md` sections 2, 4 and 9.
3. `components/ananta/why-this.tsx` (92 lines, ratified and good),
   `why-this-live.tsx` (1967 bytes), `why-not-that.tsx` (134 lines),
   `learning.ts` (221 lines), and the four small controls.
4. `lib/engine/scoring/explain.ts` and `contracts/codes.ts`.
5. `lib/recommendation.test.ts` and `lib/quick-filters.test.ts`, which assert on
   **English prose** rather than a code. Read them to see what you replace.

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
tailwind.config.ts, app/globals.css, tokens.ts, records.ts, lib/ui-guard/**     session 1
components/ananta/pipeline.ts, use-ananta.ts                                    session 2
app/layout.tsx, app/page.tsx, app/contact/**, footer.tsx, ui.tsx                 session 3
app/explore/**, map.tsx, discovery-search.tsx, travel-options.tsx                session 4
app/trips/**, components/ananta/feasibility-meter.tsx                           session 5
app/experience/**, provenance-badge.tsx, experience-media.tsx, report-button.tsx           session 6
components/ananta/stress-radar.tsx, learned-weights.tsx, app/profile/**, app/saved/**     session 8
components/ananta/replan.ts, replan-proposal.tsx, app/events/**, availability-picker.tsx   session 9
app/provider/**, app/admin/**, app/terms/**, app/privacy/**                     session 10
lib/**   FROZEN
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, vitest.config.ts, docs/**
```

New components go in `components/ananta/why/`. Yours alone.

## Task

### 1. `why-this.tsx` — ratified, plus two real bugs

The ranking is right: sorted by descending absolute contribution at `:30-32`, ties
break on `id` so it is deterministic, and the overflow count is honest at `:84-88`.
Do not rewrite it.

**Bug 1, `:53-54`:**

```tsx
<p>Objective {total > 0 ? "" : ""}{total.toFixed(3)}</p>
```

The ternary returns an empty string in **both** branches. Dead code from a removed
sign prefix, and it puzzles every reader. Either render a signed value or drop the
ternary.

**Bug 2, the bars are `aria-hidden` and there is no text equivalent.** `:70` marks
the bar `aria-hidden="true"`, correct for a decorative bar, but the sentence at
`:76` carries no magnitude. A screen-reader user gets a name and a sentence with no
number while a sighted user gets a bar whose length encodes it. **Put the number in
the sentence.**

Also `:78` prints "Weight {weight} × normalised {normalised}" as raw floats.
`0.3333333333333333` is not something a traveller should read. Three decimals,
matching `:67`.

**Depth on this component, correctly.** A component whose underlying fact is
`unverified` renders `depth-recessed` with the dashed treatment, and its sentence
says the fact was not known. A component computed from verified facts is
`depth-raised`. **A negative contribution is `depth-flush`, not recessed**,
because a penalty is a real computed result and recessing it would read as "we do
not know", which is a different and wrong claim.

### 2. `why-this-live.tsx` — find out what this is

1967 bytes, created in the last round, and the name does not explain it. Read it and
decide: if it duplicates `why-this.tsx`, **delete it**. If it is a genuine live
variant, keep it, document in a comment what distinguishes it, and make sure the
two cannot drift into showing different numbers for the same record. **Two
components rendering the same score differently is the worst outcome in the
explanation layer**, and depth doubles the damage because a mismatch is now
visible in three dimensions.

### 3. `why-not-that.tsx` — remove the duplicated map, add the rise

**`CONFIDENCE_TONE` is defined at `:16-21` and again in
`components/ananta/provenance-badge.tsx`.** Session 1 writes
`components/ananta/tokens.ts` in the first 20 to 45 minutes of its run. **Delete your
local copy and import from `@/components/ananta/tokens`.** If it is not there yet,
write the import, accept the typecheck error, continue. Do not re-declare the map.

What is already right and must survive: blocking and advisory separated at `:60-61`
and `:91-108`, the shortfall in the unit the code declares at `:23-29`, the
provenance of the causing fact at `:80-84`, and the cheapest-relaxation block at
`:110-125`. That last is the best piece of UI in the product: it answers the only
question that matters after a refusal.

**The one depth moment here, and it is a good one.** The panel **rises out of the
recessed card** when opened: `depth-flush` open, `depth-recessed` closed, session 4
owns the card. So a traveller's eye is physically drawn from a pushed-back rejected
card to the reason it is pushed back. Session 6 established the vocabulary; you
complete the motion.

Add:
- **Near-misses, ranked by shortfall ascending**, so the cheapest rejection is
  first: "8 minutes over. Widen by 10 and this fits." A record that failed by 8
  minutes is a different situation from one that failed by 90, and the current order
  does not say so.
- **Keep the advisory wording at `:93`**, "Not blocking, but not known either". It
  is exactly right.
- **The zero-rejection branch at `:44-57` is honest.** Keep it, and make sure it
  distinguishes "retrieval never returned it" from "the gate dropped it", because
  those are different failures with different fixes.

### 4. `learning.ts` — the persistence layer

221 lines, exports `PRIOR_WEIGHTS`, `WEIGHT_IDS`, `WEIGHT_BOUNDS`,
`WEIGHT_MEANING`, `LEARNER_KEY`. Storage and surface are yours; the bandit is the
engine's.

**Do not reimplement `sampleWeights` or `updateBandit`.** You own reading and
writing `BanditState` under `LEARNER_KEY`, handling absence, and rendering.

The trust core, from the masterplan: **nothing is learned without being visible and
editable.**

- A stored state must never silently change what the UI shows.
- First visit with no state must render `banditFromWeights(PRIOR_WEIGHTS)` and say
  the weights are a starting point, not a conclusion.
- **Never throw on read.** Absent, corrupt, older-shape, or quota failure all fall
  back to the prior, and if the user would notice a reset, say why.
- Note that `app/profile/page.tsx:78` reads "no behavioral profile is built in this
  prototype", which becomes false the moment a weight is learned. Session 8 owns
  that file; **write a blocker naming session 8, do not edit it.**

### 5. The four controls, and the depth rules for them

`plan-button.tsx`, `plan-badge.tsx`, `save-button.tsx`, `share-button.tsx`.

**The add-to-plan bug.** `plan-button.tsx:15` is a real toggle, while the Explore
card at `app/explore/page.tsx:240` is add-only, so its label flips to "Added to
plan" and re-clicking rewrites the same array. A user who removes a place on the
detail page and returns sees "Add to plan" again. **Session 4 will import your
`plan-button.tsx`, so make it the single implementation**: a proper toggle with
`aria-pressed`, a label reflecting real state, no local copy of the plan array.

**Depth rules for controls, and they are the fiddly part.** A control's depth must
reflect **state, not hover**. An unpressed save is `depth-flush`; a pressed one is
`depth-raised`. **A control must never change depth on hover**, because a control
that jumps in Z when the pointer arrives is a control whose depth has stopped
meaning anything, and the whole grammar collapses. Hover gets a shadow deepen and
at most 2 degrees of tilt, nothing more.

- Every control needs a real accessible name and real state feedback.
- `save-button.tsx` writes to `lib/saved.ts`, which feeds provider demand counts.
  Session 10 displays them. **Never inflate them.**
- `share-button.tsx` uses the Web Share API where it exists and degrades to a copied
  link, and **the confirmation must be announced**, because a silent clipboard write
  looks like a broken button.
- `plan-badge.tsx` is a count slotted into the bottom nav. Give it an accessible name
  containing the word "plan". **The bottom nav is `position: fixed`, so it must not
  be inside a 3D container**, and a `translateZ` on it will detach it from the
  viewport edge.

### 6. Copy register

Contracts section 3 and `SESSION/UI-UX-DESIGN.md` section 9. Every sentence points
at a field or a function. "Highly rated by travellers" is banned because **no rating
data exists**. "Verified" as a blanket claim is banned because roughly 96% of the
catalogue is generated.

## Constraints

- **RULE 0: no engine in the view layer.** `objectiveFast`, `wilsonLowerBound`,
  `sampleWeights`, `updateBandit`, `banditFromWeights`, `COMPONENT_IDS`,
  `REJECTION_CODES` come from `@/lib/engine`. `lib/ui-guard/no-engine-fork.test.ts`
  will fail your build.
- **Class names only.** No `style={{ transform }}` anywhere, including on the
  rejection panel's open and close states. Session 1's
  `reduced-motion.test.ts` depends on it.
- Zero new dependencies. No motion library.
- Never throw on a local-storage read.
- Do not edit a page to place your components. Sessions 3 to 6 and 8 to 10 place them.
  Export a clean component and let them import it.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib/ui-guard
npm run dev
```

Then:

1. Find a record rejected by a small shortfall. **Confirm the cheapest rejection is
   first and the sentence carries the number**, and that the panel rises out of the
   recessed card.
2. Tab across a card and confirm **no control changes depth on hover**. If one does,
   the grammar is already broken.
3. Clear local storage and confirm the weights panel renders a prior and says so.
4. Corrupt the bandit value in devtools and confirm the app does not crash.
5. Emulate reduced motion and confirm the panel still opens and closes, and that
   rejections are still readable from the dashed border and amber tone alone.

## Definition of done

1. The dead ternary at `:53` is gone.
2. Every contribution magnitude is in the **text**, not only in an `aria-hidden` bar.
3. Raw floats formatted to three decimals.
4. **`contribution` is never encoded as depth**, and you can say in one sentence why
   the research forbids it. Status is the only depth on this component.
5. A component whose fact is unverified is recessed; a negative contribution is
   flush, not recessed, and you tested the difference.
6. `why-this-live.tsx` is justified in a comment or deleted.
7. The duplicated `CONFIDENCE_TONE` is deleted and imported.
8. Rejections ordered by shortfall ascending, near-misses called out.
9. `learning.ts` imports the bandit and never reimplements it, and a corrupt state
   does not throw.
10. `plan-button.tsx` is the single add-to-plan implementation, with `aria-pressed`.
11. **No control changes depth on hover.** Test it and say so.
12. `git status --short` shows only your nine path patterns.
13. Your summary names every sentence you deleted, and which page still shows a claim
    you could not source.
