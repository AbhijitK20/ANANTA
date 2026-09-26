# SESSION 8 of 10 — Stress Radar, Learned Weights, Profile and Saved

> Copy everything below this line into a new session.

---

You are session 8 of 10 in the **UI/UX fix round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You own the two panels that let a traveller interrogate the system, plus the two
screens where they would look for their own history. **You also own the sentence on
the profile page that is about to become false.**

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**. RULE 0, the accessibility
   targets in section 4, especially the chart-alternative row, your row in 6.
2. `SESSION/UI-UX-DESIGN.md` sections 4, 5, 6.8 and 8.
3. `components/ananta/stress-radar.tsx` (196 lines), `learned-weights.tsx` (155
   lines), `app/profile/page.tsx` (6392 bytes), `app/saved/page.tsx` (3247 bytes).
4. `lib/engine/replan/triggers.ts` for the `tired` trigger, which is what the radar's
   pace factor is about.
5. `docs/05-design/ACCESSIBILITY.md` in full, and
   `SESSION/00-CONTRACTS.md` section 3 on intent preservation.

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
tailwind.config.ts, app/globals.css, components/ananta/tokens.ts, records.ts, lib/ui-guard/**   session 1
components/ananta/pipeline.ts, use-ananta.ts                                                   session 2
app/layout.tsx, app/page.tsx, app/contact/**, components/footer.tsx, components/ui.tsx         session 3
app/explore/**, components/map.tsx, discovery-search.tsx, travel-options.tsx                     session 4
app/trips/**, components/ananta/feasibility-meter.tsx                                          session 5
app/experience/**, provenance-badge.tsx, experience-media.tsx, report-button.tsx                 session 6
components/ananta/why-this.tsx, why-this-live.tsx, why-not-that.tsx, learning.ts,
  plan-button.tsx, plan-badge.tsx, save-button.tsx, share-button.tsx                              session 7
components/ananta/replan.ts, replan-proposal.tsx, app/events/**, availability-picker.tsx        session 9
app/provider/**, app/admin/**, app/terms/**, app/privacy/**                                    session 10
lib/**   FROZEN
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, vitest.config.ts, docs/**
```

**Your new components go in `components/ananta/learning/`.** That directory is yours
alone. Note the name is shared with session 7's `learning.ts` file, which is a
different thing entirely: theirs is persistence for the bandit, yours is the
presentation of the stress and weights panels.

## Task

### 1. The profile page contains a sentence that is about to become false

`app/profile/page.tsx:78` currently reads **"no behavioral profile is built in this
prototype."** Session 7 is landing Thompson-sampled weights with a persisted bandit
state. The moment a weight is learned, that sentence is false, and it is the kind of
false that a judge reads on a screen specifically titled Profile.

**Rewrite it honestly**, in one of two directions, and pick deliberately:

- **If weights are still only a prior**, say precisely that: "No behaviour has been
  learned yet. These weights are a starting point, and they change only when you
  save or reject something."
- **If a bandit state exists**, say what was learned, from how many observations,
  and offer the delete control.

Either is defensible. What is not defensible is the current absolute claim once the
feature exists. And the privacy principle from `docs/01-product/PRD.md` and
`MASTERPLAN.md` section 15 is explicit: **memory must be user-controlled,
explainable, deletable and minimal.** So this page needs a real control that clears
the stored state, and it must say what clearing it does.

### 2. `learned-weights.tsx` — nothing is learned without being visible

The masterplan's words: *"A recommendation you cannot interrogate is just a vibe.
Nothing is learned without being visible and editable."* That is a product
requirement, not a nice-to-have, and this component is where it is kept.

Requirements:
- **Every one of the ten `ComponentId` weights is shown**, with its current value,
  its prior, and its observation count. Not the top three. All ten, or a clear
  statement of which are at their prior and why.
- **Every one is editable**, and an edit must visibly change the ranking. Wire the
  edit through session 7's persistence in `components/ananta/learning.ts` by
  importing it. Do not reimplement the bandit; `sampleWeights`, `updateBandit` and
  `PRIOR_WEIGHTS` are in the engine.
- Show the **spread**, not just the point estimate. A Thompson sample from a Beta
  posterior has a range, and showing the range is what distinguishes learning from
  a constant. A panel showing one number per weight is indistinguishable from a
  hard-coded table.
- **Label the prior honestly.** A weak prior means the bandit has barely moved.
  Say "prior, 0 observations" rather than pretending a value was learned.
- An `estimate`-confidence component must not masquerade as learned. If a weight is
  effectively unidentifiable with the observations so far, say so.

Session 7's `WEIGHT_MEANING`, `WEIGHT_BOUNDS` and `WEIGHT_IDS` are the source for
labels and ranges. Import them; do not retype.

### 3. `stress-radar.tsx` — the accessibility gap is yours to close

196 lines, seven factors, a 260px SVG with a computed polygon, and one rescue move
for the worst factor. The mathematics looks right: `timeFit`, `budgetHeadroom`,
`travelEfficiency` against a `TRAVEL_CEILING_KM` of 14, `crowdExposure`,
`variety` from distinct categories, `paceMatch` against `idealStops`.

**The gap, and it is in the accessibility targets:** a 7-axis radar is unreadable to
a screen reader, useless in print, and impossible to compare across two plans. No
alternative text carries seven numbers at once.

**Ship a table equivalent in the DOM.** A real `<table>` with factor, score, and the
one-line meaning, visually collapsed behind a disclosure but present and reachable.
Not an `aria-label` with seven numbers crammed into a sentence. That is the whole
fix, and it is required, not optional.

Also:
- **The rescue move is the point of the panel.** "They are tired" and "this is 6 km
  of travel for a 40 minute plan" are actions, not observations. Make the worst
  factor first in the reading order, and make the move a real affordance where one
  exists, such as firing the `tired` trigger from session 9's replan module. Import
  it; do not reimplement the trigger.
- **Colour is not the encoding.** Each axis needs a text label, and the polygon fill
  must not be the only thing carrying meaning. `docs/05-design/ACCESSIBILITY.md:8`
  requires that status is never conveyed by colour alone.
- A score of 0 and a score of 100 must look different from "not measured". Use the
  `unverified` dashed-chip treatment from `tokens.ts` for anything with no data
  behind it, which is different from a genuine zero.
- The `travelKm` figure comes from a straight-line estimate at a manifest congestion
  multiplier. **Label it.** A "travel efficiency" score computed from an estimate
  must say so, or the number is a vibe.

### 4. `app/saved/**` — the honesty of a personal list

A saved list is the most personal screen in the product and it is where "why is this
here?" matters most.

- Each saved item needs its **provenance strip visible without a click**, because a
  traveller looking at their own list is checking whether they were misled. Session
  6's badge is the component. Import it.
- **Saved is not booked.** `docs/05-design/DESIGN-CONTRACT.md:20` and
  `MASTERPLAN.md` section 9 both forbid implying a transaction. There are no
  payments, no commissions, no reservations. The empty state and the item state must
  both be clear about that.
- An empty saved list is a `UiState` from contracts section 2, and it must offer the
  next action, not apologise.
- If any item's availability changed since it was saved, **say so with the
  timestamp**. That is the most useful thing this screen can tell someone, and
  session 9 owns the availability data. Import it, do not re-derive it.

### 5. `app/profile/**` — what else belongs here

- The demo-location disclosure at `:60`, "This is a fixed demo position, not live
  geolocation", is **correct and ratified. Keep it.** Session 3 owns the footer, and
  a fixed demo position on a map is exactly the kind of thing that must stay
  disclosed.
- Group the page: what the system knows about you, what it has learned, what you can
  change, what you can delete. Four blocks, in that order. The delete block last,
  and it must be real.
- No authentication exists and none is planned this round. **Do not imply a
  profile is an account.** It is a local record on this device. Say so.

## Constraints

- **RULE 0: no engine in the view layer.** `PRIOR_WEIGHTS`, `WEIGHT_IDS`,
  `sampleWeights`, `updateBandit`, `banditFromWeights`, `stopTotals` come from
  `@/lib/engine` or from session 7's `learning.ts` export surface. If something is
  missing, it is a blocker.
- Zero new dependencies.
- Never throw on a local-storage read. Handle absent, corrupt and older-shape values
  by falling back to the prior and, where the user would notice, saying so.
- No em dash, no emoji. No hard-coded dataset number.
- One `text-display` per screen.
- Every number you render must be traceable to a field. A stress score computed from
  an estimate is labelled as such.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib/ui-guard
npm run dev
```

Then, specifically: open the radar with a screen reader or read the table in the
DOM and confirm you can get all seven numbers. Edit one weight and confirm the
ranking changes. Delete the stored state and confirm the page says what happened. Put
a corrupt value in local storage and confirm the app does not crash.

## Definition of done

1. `app/profile/page.tsx:78` no longer makes an absolute claim that is now false, and
   the replacement says what has actually been learned, from how many observations.
2. There is a real control that clears stored state, and it says what clearing does.
3. All ten weights are shown, editable, and labelled prior versus learned.
4. The Thompson **range** is displayed, not only the point estimate.
5. The stress radar has a real `<table>` equivalent in the DOM, reachable and
   complete.
6. The rescue move is first in reading order and is an affordance where one exists.
7. Every radar axis has a text label; colour is not the encoding.
8. Travel-derived factors are labelled as straight-line estimates.
9. `app/saved` shows provenance without a click, states that saved is not booked,
   and flags availability changes with a timestamp.
10. The fixed-demo-position disclosure is intact.
11. `git status --short` shows only your five path patterns.
12. Your summary states, in one paragraph, exactly what the system now knows about a
    traveller and exactly what a traveller can do about it.
