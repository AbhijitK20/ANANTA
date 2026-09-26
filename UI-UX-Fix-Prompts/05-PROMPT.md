# SESSION 5 of 10 — Trips: the Plan Tilts When It Stops Agreeing With Itself

> Copy everything below this line into a new session.

---

You are session 5 of 10 in the **spatial UI round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

**You own the highest-value screen, and you are implementing the single best idea
in the entire spatial design.**

## The idea

The engine computes `objectiveFast` and, independently, `objectiveNaive`, and
asserts they agree to `1e-6`. That number exists. **Nothing in the UI shows it.**

```
tilt = clamp(drift / DRIFT_TOLERANCE, 0, 1) × 6deg,  rotateX
```

At zero drift the plan is **perfectly flat**, because the two independent
derivations agree exactly. As drift approaches the tolerance it visibly **leans**.
Past the tolerance the plan is recessed and refuses to present as valid.

A judge who watches the plan tilt is not reading a number. They are watching the
product lose confidence in itself, in real time, from its own output. **No copy can
do that.** The number still appears in the text, because the tilt is a redundant
encoding, not a replacement.

And the second idea, which is almost as good: **the plan recedes into the future.**
Stop 1 at `depth-lifted`, stop 2 at `depth-raised`, stop 3 at `depth-flush`, stop 4
at `depth-recessed`. A descending staircase reading near to far. It encodes
sequence in the one channel that is genuinely ordered, and it means the plan is
legible as a shape before a word is read.

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**. Section 6 encodings 3, 4 and
   5 are yours. Section 2 for the depth scale, section 4 for motion, section 11 for
   the gate.
2. `SESSION/UI-UX-DESIGN.md` sections 5, 6.4 and 8.
3. `app/trips/page.tsx` (17KB),
   `components/ananta/feasibility-meter.tsx` (124 lines, ratified and good).
4. `lib/engine/validation/validate.ts` and its return type. **This is your input.**
5. `lib/engine/pipeline` exports session 2 is writing: `depthForStop`,
   `tiltForDrift`, `depthForRung`.

## ALLOWED — you own these, exclusively

```
app/trips/**
components/ananta/feasibility-meter.tsx
components/ananta/trips/**
UI-UX-Fix-Prompts/BLOCKERS/5.md
```

## FORBIDDEN

```
tailwind.config.ts, app/globals.css, tokens.ts, records.ts, lib/ui-guard/**     session 1
components/ananta/pipeline.ts, use-ananta.ts                                    session 2
app/layout.tsx, app/page.tsx, app/contact/**, footer.tsx, ui.tsx                 session 3
app/explore/**, map.tsx, discovery-search.tsx, travel-options.tsx                session 4
app/experience/**, provenance-badge.tsx, experience-media.tsx, report-button.tsx           session 6
components/ananta/why-this.tsx, why-this-live.tsx, why-not-that.tsx, learning.ts,
  plan-button.tsx, plan-badge.tsx, save-button.tsx, share-button.tsx             session 7
components/ananta/stress-radar.tsx, learned-weights.tsx, app/profile/**, app/saved/**     session 8
components/ananta/replan.ts, replan-proposal.tsx, app/events/**, availability-picker.tsx   session 9
app/provider/**, app/admin/**, app/terms/**, app/privacy/**                     session 10
lib/**   FROZEN, including lib/plan.ts
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, vitest.config.ts, docs/**
```

New components go in `components/ananta/trips/`. Yours alone.

## Task, in screen order. A judge should hit the evidence before the plan.

### 1. The integrity stamp and the tilt

`validate()` returns `drift` and `satisfiedFraction`. Build the stamp.

- Render `drift` to six decimals from the real value. **Not a string constant.**
- **`tiltForDrift(drift)` returns a class name** from session 1's seven static
  rules. **No runtime style computation, ever.** A computed transform bypasses the
  reduced-motion block, and `lib/ui-guard/reduced-motion.test.ts` will fail your
  build.
- The tilt applies to the **plan container**, not just the stamp. A tilted badge is
  a novelty; a tilted plan is a statement.
- **When `drift > DRIFT_TOLERANCE` the plan is a failure.** Recessed, in the alarm
  colour, naming the component that diverged from the per-component drift table,
  and **it does not present as valid.** A drifted plan shown in a reassuring layout
  is the worst outcome in the entire product.
- `satisfiedFraction` as a real count: "23 of 23 hard constraints satisfied". Below
  1, name which via `issues` and route to the relaxation note.
- **Import `DRIFT_TOLERANCE` from the engine.** A second literal means the stamp and
  the drift test can disagree about what failure is.
- Give it a `title` explaining what "re-derived independently" means, in one plain
  sentence, because a judge who does not understand it will not be impressed by it.

The transition into tilt is `--motion-scene` at 320ms, `ease-out-soft`. It is the
one place a slower transition is justified, because the tilt is the most
consequential state change in the product.

### 2. The plan staircase

`depthForStop(index, total)` from `pipeline.ts`. Monotonic, total, about 9px per
step, `lifted` to `recessed` across four stops.

- Confirm a **one-stop plan** still renders correctly, at `depth-lifted`.
- The staircase must be **visible as a shape** on desktop, so use the horizontal
  timeline and let the Z descend left to right. On mobile, where it stacks
  vertically, the Z descent is much less legible, so **fall back to a depth-coded
  left border or an explicit step number** rather than relying on 3D alone. A depth
  cue that only works in one orientation is not a cue.
- Hovering a stop lifts it one step **without changing its position in the
  staircase.** Lifting must not reorder the plan, because order is data.

### 3. The ladder is a ladder, visually

`depthForRung(rung)`: `strict` lifted, `dropped_minimum` raised, `greedy_fill`
flush, `single_best` recessed.

"We settled for one stop" now sits visibly lower than "we found exactly what you
asked for". `MASTERPLAN.md` says *"Relaxed: minimum 1 stop instead of 2" is a far
better demo than an unsat core."* This is the same sentence, expressed in space.
**Always render the rung's name and its cost in text too.**

### 4. `components/ananta/feasibility-meter.tsx` — ratified, integrate and extend

This component is **good**. The three-segment bar with the buffer given its own
width and its own number, the `role="img"` with a full sentence at `:68`, the
overflow past the track, and the honest footnote at `:117-121` are all correct. Do
not rewrite it.

What it needs:
- **It goes on a plane, and the plane is `depth-raised`.** It is the signature
  element of the product, so it stands proud of the plan below it.
- **The overflow segment must be visible in 3D.** The alarm colour at
  `feasibility-meter.tsx:83` is the one place on this screen where the alarm
  treatment is correct, so do not soften it. But the bar is a 2D element inside a
  3D container, so confirm it does not visually detach from the panel at high Z.
- **The `breakpoint` case.** At `:65-87` the bar is a `flex` of fixed segments with
  no labels inside them, so below about 480px it is four unlabelled blocks. The
  numbers are in the `dl` below so it degrades gracefully, but verify it and add a
  stacked variant if it does not.
- **The `sold_out` case.** When `stop.availability.soldOutAt` is set the meter must
  not silently include that stop. Surface it and hand off to session 9's proposal.
  Export the state so session 9 can consume it.
- Keep the footnote **verbatim**. It names the congestion multiplier, the buffer
  rate, and that nothing there is a live availability claim. It is the most honest
  paragraph in the product and shortening it to save space defeats the design.
- Confirm the `role="img"` label stays correct when a segment is 0. `:71` already
  skips zero segments, so check the sentence at `:68` still reads properly.

### 5. Kill the fabricated clock

`app/trips/page.tsx:126`:

```tsx
<p>{index === 0 ? "Start" : `${index + 1}:15 PM`}</p>
```

Stop 2 is always "2:15 PM". It does not read `availableMinutes`, does not read the
deadline, does not sum previous durations. **This is the worst honesty defect in the
repository** and the spatial round makes it worse, because a floating card with a
fabricated clock reads as authoritative.

**Do not replace it with another template.** Two honest options:

- **A real clock**, if `Stop.arriveBy` and `visitMinutes` are real, plus a
  **visible and editable** start time, because a clock is only honest if the reader
  knows what it is relative to.
- **No clock**: `Stop 1`, `Stop 2`, with the real durations beside them. Weaker,
  honest.

State which you chose and why. If you choose the clock and the start time is still a
literal anywhere, that is the same defect in new clothes.

**Also delete at `:126`:** "Selected because it matches the current interest and
sits inside the available plan area." Printed identically for every stop. No
interest model ran, no area check ran. Replace with session 7's per-stop why-this.

### 6. `lib/plan.ts:35` is still called and it is an OOM

```ts
generatePlanVariants(places, allExperiences.slice(0, 60), budget, availableMinutes, ...)
```

`lib/plan.ts:88-95` materialises C(60, k). At 5 stops that is 5,461,512 arrays with
`evaluatePlan` on each, inside a `useMemo` on the render path. **A 5 stop plan is a
multi-second freeze on every budget-slider keystroke.** `lib/plan.ts` is not yours
and session 5 of the previous round replaced the algorithm in `lib/engine/packing/`.

**Stop calling it.** Consume `pack()` from `@/lib/engine` via `pipeline.ts`. If
session 2 has not landed, that is a blocker naming session 2. **Do not fix it
yourself and do not add a UI workaround such as a smaller `slice`.** An honest
"solving" state is correct; a hidden cap is not.

The old "No alternative plan fits these limits" at `:136` goes away, replaced by the
engine's named ladder with its rung and its note.

### 7. The array-index "recommendation" and its false copy

`app/trips/page.tsx:94`:

```ts
allExperiences.find((item) => item.statusTone !== "amber" && !ids.includes(item.id))?.id ?? null
```

First match in array order, ignoring location, category, budget, time and area. For
anyone not already planning `kala-ghoda-art-walk` it returns index 0.

**And `:132` is worse:** "This option removes the weather-dependent stop and keeps
the rest of the plan within the current area." Both clauses are false. **Delete both
sentences.** Session 9's replan chooses properly and supplies a real reason.

### 8. Wire in the other sessions by import only

Session 8's `stress-radar.tsx` and `learned-weights.tsx`, session 7's `why-this.tsx`
and `why-not-that.tsx` per stop, session 9's `replan-proposal.tsx` and the six
trigger controls.

**You own the page so you integrate. You do not edit their files.** If a file is
missing, render an honest `UiState` slot, note it in your blockers file, and move
on. **Do not write a stub of someone else's component.** That is how
`pipeline.ts` happened.

## Constraints

- **RULE 0: no engine in the view layer.** `pack`, `buildStops`, `stopTotals`,
  `validate`, `relax`, `DRIFT_TOLERANCE`, `depthForStop`, `tiltForDrift` all come
  from the engine or `pipeline.ts`.
- **Class names only.** Never `style={{ transform }}`, `style={{ rotateX }}` or
  `style={{ translateZ }}`. It bypasses the reduced-motion block.
- Zero new dependencies. No motion library.
- No em dash, no emoji, no hard-coded dataset number.
- One `text-display` on this screen. The meter's headline correctly claims it.
- Add `aria-live="polite"` to the stage and tilt region, so a drift alarm and a
  replan both announce. It is in the accessibility targets and currently missing.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib/ui-guard lib/engine/validation
npm run dev
```

Then, in this order:

1. Add five stops, drag the budget slider, and **confirm the tab does not freeze**.
   That is the `C(60,k)` test and it is the difference between a demo that works and
   one that hangs.
2. Force a drift and **watch the plan tilt**, then confirm the text still carries the
   number, because the tilt is redundant encoding, not a replacement.
3. Emulate reduced motion. **The drift state must still be unmistakable by colour
   and text alone**, with no tilt. If you have to guess at tolerance, the fallback
   is not doing its job.
4. 390px: the staircase falls back to a non-3D cue and the meter does not overflow.
5. Tab the whole page. A ring at every stop, none clipped by a translateZ.

## Definition of done

1. The integrity stamp renders real `drift` and `satisfiedFraction`, and a drifted
   plan is shown as failed, recessed, naming the diverging component.
2. The tilt comes from a class name, never a computed style, and at zero drift the
   plan is flat.
3. The stop staircase is monotonic, handles a one-stop plan, and has a non-3D
   fallback on mobile.
4. The relaxation rung is expressed as height **and** named in text.
5. The fabricated clock is gone, and you state which honest option you took.
6. "Selected because it matches the current interest" is gone.
7. `generatePlanVariants` is no longer called. Five stops does not freeze.
8. The `allExperiences.find` recommendation and its false copy at `:132` are gone.
9. Sessions 7, 8 and 9 are integrated by import. No stubs written.
10. `aria-live` on the stage and drift region.
11. Reduced motion still communicates drift, and you verified it.
12. `git status --short` shows only your three path patterns.
13. Your summary quotes the validation stamp's real output from a real run, and
    reports the measured tilt in degrees at a drift you chose.
