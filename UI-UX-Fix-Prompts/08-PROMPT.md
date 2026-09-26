# SESSION 8 of 10 — Stress Radar, Learned Weights, Profile and Saved

> Copy everything below this line into a new session.

---

You are session 8 of 10 in the **spatial UI round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You own the two panels that let a traveller interrogate the system, the two screens
where they would look for their own history, and the sentence on the profile page
that is about to become false.

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**. Section 6 encoding 5
   (answer quality is height) is partly yours, section 0 is the ruling on depth and
   data, section 4 is your accessibility row set.
2. `SESSION/UI-UX-DESIGN.md` sections 4, 5, 6.8 and 8.
3. `components/ananta/stress-radar.tsx` (196 lines), `learned-weights.tsx` (155
   lines), `app/profile/page.tsx` (6392 bytes), `app/saved/page.tsx` (3247 bytes).
4. `lib/engine/replan/triggers.ts` for the `tired` trigger, which is what the radar's
   pace factor is about.
5. `docs/05-design/ACCESSIBILITY.md` in full, and `SESSION/00-CONTRACTS.md` section
   3 on intent preservation.

## The decision on your radar: no third axis, and the research is why

You might be tempted to make the radar genuinely 3D, give it a `rotateX` so the
polygon has real depth, and read factor magnitude off the Z axis.

**Do not.** The CHI 2026 work is unambiguous: *"the use of the depth dimension of
position is generally discouraged in the Information Visualization community"*,
because perspective distortion corrupts the size channel, and *"when data is not
inherently three-dimensional"* depth is the wrong tool. A 7-axis radar is a
planar chart. **A radar chart is exactly the "information-dense page" the spatial
guidance names as a place where "3D effects compete with the content for
attention".**

Keep the radar flat and 2D. It is already correct at 260px with a computed polygon.
**Give it depth as a frame, not as a channel**: the panel is `depth-raised` as a
whole, and the worst factor's rescue move rises to `depth-lifted`. That reads as
"this is the one thing to act on" without a single number being ambiguous.

## ALLOWED — you own these, exclusively

```
components/ananta/stress-radar.tsx
components/ananta/learned-weights.tsx
app/profile/**
app/saved/**
components/ananta/learning/**
UI-UX-Fix-Prompts/BLOCKERS/8.md
```

## FORBIDDEN

```
tailwind.config.ts, app/globals.css, tokens.ts, records.ts, lib/ui-guard/**     session 1
components/ananta/pipeline.ts, use-ananta.ts                                    session 2
app/layout.tsx, app/page.tsx, app/contact/**, footer.tsx, ui.tsx                 session 3
app/explore/**, map.tsx, discovery-search.tsx, travel-options.tsx                session 4
app/trips/**, components/ananta/feasibility-meter.tsx                           session 5
app/experience/**, provenance-badge.tsx, experience-media.tsx, report-button.tsx           session 6
components/ananta/why-this.tsx, why-this-live.tsx, why-not-that.tsx, learning.ts,
  plan-button.tsx, plan-badge.tsx, save-button.tsx, share-button.tsx             session 7
components/ananta/replan.ts, replan-proposal.tsx, app/events/**, availability-picker.tsx   session 9
app/provider/**, app/admin/**, app/terms/**, app/privacy/**                     session 10
lib/**   FROZEN
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, vitest.config.ts, docs/**
```

New components go in `components/ananta/learning/`. Yours alone. Note the name is
shared with session 7's `learning.ts`, which is a different thing: theirs is bandit
persistence, yours is the presentation of the stress and weights panels.

## Task

### 1. The profile page has a sentence about to become false

`app/profile/page.tsx:78` reads **"no behavioral profile is built in this
prototype."** Session 7 is landing Thompson-sampled weights with a persisted bandit
state. The moment a weight is learned, that sentence is false, on a screen titled
Profile.

**Rewrite it honestly**, picking deliberately between two directions:

- **Still only a prior**: "No behaviour has been learned yet. These weights are a
  starting point, and they change only when you save or reject something."
- **A bandit state exists**: say what was learned, from how many observations, and
  offer the delete control.

Both are defensible. The current absolute claim is not, once the feature exists. And
`MASTERPLAN.md` section 15 and `docs/01-product/PRD.md` are explicit: **memory must
be user-controlled, explainable, deletable and minimal.** So this page needs a real
control that clears the stored state, and it must say what clearing it does.

### 2. `learned-weights.tsx` — nothing is learned without being visible

The masterplan: *"A recommendation you cannot interrogate is just a vibe. Nothing is
learned without being visible and editable."* That is a product requirement.

- **All ten `ComponentId` weights shown**, with the current value, the prior, and the
  observation count. Not the top three. All ten, or a clear statement of which are
  at their prior and why.
- **All ten editable**, and an edit must visibly change the ranking. Wire through
  session 7's persistence in `components/ananta/learning.ts` by importing it. Do not
  reimplement the bandit.
- **Show the spread, not just the point estimate.** A Thompson sample from a Beta
  posterior has a range, and the range is what distinguishes learning from a
  hard-coded table.
- **Label the prior honestly.** A weak prior means the bandit has barely moved. Say
  "prior, 0 observations" rather than pretending a value was learned.
- An `estimate`-confidence component must not masquerade as learned. If a weight is
  unidentifiable with the observations so far, **say so, and recess that row**.

**Depth here, carefully.** Rows at the prior are `depth-flush`; rows the bandit has
actually moved are `depth-raised`. **A row is never `depth-lifted`**, because lifted
means "act on this" and no individual weight is a call to action. Only the radar's
rescue move gets that, and session 5 lifts that.

Session 7's `WEIGHT_MEANING`, `WEIGHT_BOUNDS` and `WEIGHT_IDS` are the source for
labels and ranges. Import them; do not retype.

### 3. `stress-radar.tsx` — the accessibility gap, and the honest labelling

196 lines, seven factors, a 260px SVG polygon, and one rescue move for the worst
factor. The maths looks right: `timeFit`, `budgetHeadroom`, `travelEfficiency`
against a `TRAVEL_CEILING_KM` of 14, `crowdExposure`, `variety` from distinct
categories, `paceMatch` against `idealStops`.

**Ship a table equivalent in the DOM.** A 7-axis radar is unreadable to a screen
reader, useless in print, and impossible to compare across two plans. A real
`<table>` with factor, score and one-line meaning, visually collapsed behind a
disclosure but present and reachable. Not an `aria-label` with seven numbers in a
sentence. This is in the accessibility targets and it is currently missing.

Also:
- **The rescue move is the point of the panel.** "They are tired" and "this is 6 km
  of travel for a 40 minute plan" are actions, not observations. The worst factor
  comes **first in reading order** and its move rises to `depth-lifted`. Make it a
  real affordance where one exists, such as firing the `tired` trigger from session
  9's replan module. Import it; do not reimplement the trigger.
- **Colour is not the encoding.** Every axis needs a text label, and the polygon fill
  must not be the only carrier. `ACCESSIBILITY.md:8` requires it.
- **A score of 0 and a score of 100 must look different from "not measured."** Use
  the `unverified` dashed treatment from `tokens.ts` for anything with no data
  behind it. That is a genuine third state and conflating it with a real zero is how
  a radar starts lying.
- **The `travelKm` figure is a straight-line estimate at a manifest congestion
  multiplier. Label it.** A travel-efficiency score computed from an estimate that
  does not say so is a vibe, and this is the most likely place on the whole site for
  that to happen.

### 4. `app/saved/**` — the honesty of a personal list

The most personal screen in the product, and where "why is this here?" matters most.

- **Provenance visible without a click**, because a traveller checking their own
  list is checking whether they were misled. Session 6's badge is the component.
  Import it. A saved item whose price was an estimate should *look* like that in the
  list, not only on the detail page.
- **Saved is not booked.** `DESIGN-CONTRACT.md:20` and `MASTERPLAN.md` section 9
  both forbid implying a transaction. There are no payments, no commissions, no
  reservations. The empty state and the item state must both be clear.
- An empty saved list is a `UiState`, and it offers the next action rather than
  apologising.
- **If an item's availability changed since it was saved, say so with the
  timestamp.** That is the most useful thing this screen can say. Session 9 owns the
  availability data; import it, do not re-derive it.
- **Depth on this screen is status only.** Saved items `depth-raised`, an item whose
  hours are unverified `depth-recessed`. **Never** use depth for recency or for
  position in the list, because recency is a value and values do not get depth.

### 5. `app/profile/**` — what else belongs

- **The demo-location disclosure at `:60`, "This is a fixed demo position, not live
  geolocation", is correct and ratified. Keep it.** Session 3 owns the footer, and a
  fixed demo position on a map is exactly the kind of thing that must stay
  disclosed.
- Four blocks in this order: what the system knows about you, what it has learned,
  what you can change, what you can delete. **The delete block last, and it must be
  real.**
- **No authentication exists and none is planned.** Do not imply a profile is an
  account. It is a local record on this device. Say so.

## Constraints

- **RULE 0: no engine in the view layer.** `PRIOR_WEIGHTS`, `WEIGHT_IDS`,
  `sampleWeights`, `updateBandit`, `banditFromWeights`, `stopTotals` come from
  `@/lib/engine` or session 7's `learning.ts` export surface.
- **Class names only.** No `style={{ transform }}`.
- Zero new dependencies. No motion library.
- Never throw on a local-storage read. Handle absent, corrupt and older-shape values.
- No em dash, no emoji, no hard-coded dataset number.
- One `text-display` per screen.
- Every number traceable to a field. A score computed from an estimate is labelled.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib/ui-guard
npm run dev
```

Then:

1. **Read the radar's table in the DOM** and confirm you can get all seven numbers.
2. **Confirm the radar is not 3D.** If you find yourself adding a `rotateX` to the
   panel to "make it pop", delete it and say why in your summary.
3. Edit one weight and confirm the ranking changes and the row moves from flush to
   raised.
4. Delete the stored state and confirm the page says what happened.
5. Put a corrupt value in local storage and confirm no crash.
6. Emulate reduced motion: the radar still reads, the table is still reachable, and
   the "not measured" state is still distinguishable from a real zero.

## Definition of done

1. `app/profile/page.tsx:78` no longer makes an absolute claim that is now false, and
   the replacement says what was learned from how many observations.
2. A real control clears stored state, and it says what clearing does.
3. All ten weights shown, editable, labelled prior versus learned, **with the
   Thompson range**, and at-prior rows recessed.
4. **The radar is flat.** No `rotateX`, no depth as a value channel, and you can
   state the research reason.
5. A real `<table>` equivalent in the DOM, reachable and complete.
6. The rescue move is first in reading order, is `depth-lifted`, and is an
   affordance where one exists.
7. Every axis has a text label. Colour is not the encoding.
8. "Not measured" is visually distinct from a real zero, using the dashed
   `unverified` treatment.
9. Travel-derived factors are labelled as straight-line estimates.
10. `app/saved` shows provenance without a click, states saved is not booked, and
    flags availability changes with a timestamp.
11. Depth on both screens encodes status only, never recency or list position.
12. The fixed-demo-position disclosure is intact.
13. `git status --short` shows only your five path patterns.
14. Your summary states, in one paragraph, exactly what the system now knows about a
    traveller and exactly what a traveller can do about it.
