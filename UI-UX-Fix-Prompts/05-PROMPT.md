# SESSION 5 of 10 — Trips: the Proof Screen

> Copy everything below this line into a new session.

---

You are session 5 of 10 in the **UI/UX fix round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

**You own the highest-value screen in the product, and the single most important
element on it does not exist yet.**

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**. RULE 0, the accessibility
   targets in section 4, and your row in section 6.
2. `SESSION/UI-UX-DESIGN.md` sections 5, 6.4 and 8.
3. `app/trips/page.tsx` (17KB), `components/ananta/feasibility-meter.tsx` (124 lines,
   ratified and good), `components/ananta/stops` helpers in `pipeline.ts`.
4. `lib/engine/validation/validate.ts` and its return type. **This is the source of
   the element you are about to build.**
5. `docs/05-design/DESIGN-CONTRACT.md` and `docs/05-design/ACCESSIBILITY.md`.

## ALLOWED — you own these, exclusively

```
app/trips/**
components/ananta/feasibility-meter.tsx
components/ananta/trips/**
UI-UX-Fix-Prompts/BLOCKERS/5.md
```

## FORBIDDEN

```
tailwind.config.ts, app/globals.css, components/ananta/tokens.ts, records.ts, lib/ui-guard/**   session 1
components/ananta/pipeline.ts, use-ananta.ts                                                   session 2
app/layout.tsx, app/page.tsx, app/contact/**, components/footer.tsx, components/ui.tsx         session 3
app/explore/**, components/map.tsx, discovery-search.tsx, travel-options.tsx                     session 4
app/experience/**, provenance-badge.tsx, experience-media.tsx, report-button.tsx                 session 6
components/ananta/why-this.tsx, why-this-live.tsx, why-not-that.tsx, learning.ts,
  plan-button.tsx, plan-badge.tsx, save-button.tsx, share-button.tsx                              session 7
components/ananta/stress-radar.tsx, learned-weights.tsx, app/profile/**, app/saved/**            session 8
components/ananta/replan.ts, replan-proposal.tsx, app/events/**, availability-picker.tsx        session 9
app/provider/**, app/admin/**, app/terms/**, app/privacy/**                                    session 10
lib/**   FROZEN, including lib/plan.ts
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, vitest.config.ts, docs/**
```

**Your new components go in `components/ananta/trips/`.** That directory is yours
alone.

## Task, in screen order

`SESSION/UI-UX-DESIGN.md` 6.4 gives the order. A judge should hit the evidence
before the plan.

### 1. The validation stamp — build this first

**This does not exist and it is the most valuable element on the site.**

`validate()` already returns `drift` and `satisfiedFraction`. A drift test in
`lib/engine/validation/drift.test.ts` already asserts that `objectiveFast` and
`objectiveNaive`, two independent derivations, agree to `1e-6`. **Nothing in the UI
shows it.**

A judge who reads **"Objective re-derived independently. Drift 0.000000"** next to a
plan they are about to trust is a judge who believes the engine. It is the
credibility anchor of the entire project rendered as one line.

Requirements:
- Render `drift` from the real `ValidationResult`, formatted to six decimals. Not a
  string constant.
- When `drift > DRIFT_TOLERANCE`, this is a **failure**, not a footnote. Render the
  alarm colour, name the component that diverged from the per-component drift table,
  and **do not present the plan as valid.** A drifted plan shown with a reassuring
  layout is the worst outcome in the product.
- Show `satisfiedFraction` as a real number with a real count: "23 of 23 hard
  constraints satisfied." When it is below 1, say which ones, via the `issues`
  array, and route to the relaxation note.
- Import `DRIFT_TOLERANCE` from the engine. Do not write a second literal.
- Give the stamp a `title` or a tooltip that explains what "re-derived
  independently" means, because a judge who does not understand it will not be
  impressed by it. One sentence, in plain words.

### 2. `components/ananta/feasibility-meter.tsx` — ratified, integrate and extend

This component is **good**. The three-segment bar with the buffer given its own
width and its own number, the `role="img"` with a full sentence at `:68`, the
overflow past the track, and the honest footnote at `:117-121` are all correct.
Do not rewrite it.

What it needs:
- **The `breakpoint` case.** The bar is `flex` with three fixed segments and no
  labels inside them. Below about 480px the three segments plus the overflow are
  four unlabelled blocks. The numbers are in the `dl` below, so it degrades
  gracefully, but confirm it and add a minimum width or a stacked variant if it
  does not.
- **The `availability` state is the interesting one.** When
  `stop.availability.soldOutAt` is set, the meter should not silently include that
  stop. Surface it and hand off to session 9's replan proposal. The masterplan
  trigger is called `sold_out`.
- Keep the footnote. It is the single most honest paragraph in the product and it
  names the congestion multiplier, the buffer rate, and that nothing here is a live
  availability claim. Do not shorten it to save space.
- Add a `zero` case guard: `aria-label` must stay correct when activity, travel or
  buffer is 0. `:71` already skips a zero segment, so confirm the sentence at `:68`
  still reads properly with a zero in it.

### 3. The plan timeline — kill the fabricated clock

**`app/trips/page.tsx:126` currently renders:**

```tsx
<p>{index === 0 ? "Start" : `${index + 1}:15 PM`}</p>
```

Stop 2 is always "2:15 PM". It does not read `availableMinutes`, does not read the
deadline, does not sum previous durations, and is completely independent of any
route data. **This is the worst honesty defect in the repository.**
`SESSION/UI-UX-DESIGN.md` section 9 lists it first under "do not".

**Do not replace it with another template.** You have two honest options:

- **Real clock.** If `Stop.arriveBy` and `visitMinutes` are real, and the traveller
  has seen or chosen a start time, render the clock. `minutesOfDay` and
  `clockLabel` already exist in `pipeline.ts`. Add a start-time control if one does
  not exist, and make the start time **visible and editable**, because a clock is
  only honest if the reader knows what it is relative to.
- **No clock.** Render `Stop 1`, `Stop 2`, with the real durations beside them. Weaker,
  but honest.

State plainly in your summary which you chose and why. If you choose the clock and
the start time is still a fixed literal anywhere, that is the same defect wearing a
new hat.

**Also delete at `:126`:** "Selected because it matches the current interest and sits
inside the available plan area." Printed identically for every stop. No interest
model ran and no area check ran. Replace with session 7's per-stop why-this.

### 4. `lib/plan.ts:35` is still being called and it is an OOM

```ts
generatePlanVariants(places, allExperiences.slice(0, 60), budget, availableMinutes, ...)
```

`lib/plan.ts:88-95` materialises C(60, k) combinations. At 5 stops that is 5,461,512
arrays, with `evaluatePlan` run on each, inside a `useMemo` on the render path. **A
5 stop plan is a multi-second browser freeze on every budget-slider keystroke.**
`lib/plan.ts` is not yours, and session 5 of the previous round replaced the
algorithm inside `lib/engine/packing/`.

**Stop calling it.** Consume `pack()` from `@/lib/engine` via
`pipeline.ts`. If session 2 has not landed the re-export yet, that is a blocker
naming session 2. **Do not fix it yourself and do not build a UI workaround such as
a smaller `slice`.** An honest "solving" state is correct; a hidden cap is not.

The old "No alternative plan fits these limits" string at `:136` must go. The
replacement is the engine's named ladder with its rung and its note.

### 5. `app/trips/page.tsx:94` — the array-index "recommendation"

```ts
setWeatherAlternative(allExperiences.find((item) => item.statusTone !== "amber" && !ids.includes(item.id))?.id ?? null)
```

First match in array order. Ignores location, category, budget, time and area. For
any user not already planning `kala-ghoda-art-walk`, the "suggested indoor
alternative" is index 0 of the array.

**And the copy at `:132` is worse:** "This option removes the weather-dependent stop
and keeps the rest of the plan within the current area." Both clauses are false.
Delete both sentences. Session 9's replan chooses properly and supplies a real
reason.

### 6. Wire in the other sessions, one way only

You own the page, so you integrate. Each of these is another session's file, so
**import, do not edit**:

- Session 8's `stress-radar.tsx` and `learned-weights.tsx`
- Session 7's `why-this.tsx` and `why-not-that.tsx`, per stop
- Session 9's `replan-proposal.tsx`, and the six trigger controls

If any of those files does not exist when you get there, render an honest empty
slot with a `UiState` from contracts section 2, note it in your blockers file, and
move on. **Do not create a stub of someone else's component.** That is how
`pipeline.ts` happened.

### 7. The `UiState` coverage

All nine apply to this screen. `solving` shows the stage, not a spinner.
`nothing-fits` leads with the cheapest relaxation. `sold-out` states the fact and
its timestamp, then offers the replan. `broken` names what failed and what still
works.

Add `aria-live="polite"` to the stage line, so solving and replanning announce
themselves. That is in the accessibility targets and it is currently missing.

## Constraints

- **RULE 0: no engine in the view layer.** `pack`, `buildStops`, `stopTotals`,
  `validate`, `relax`, `objectiveFast` come from `@/lib/engine`.
- Zero new dependencies.
- No em dash, no emoji. No hard-coded dataset number.
- Keep `app/trips/page.tsx` responsive: the existing `sm:grid-cols-4` metric row
  must not overflow at 390px.
- One `text-display` on this screen. The meter's headline at
  `feasibility-meter.tsx:54` currently claims it, and that is the right choice.
  Everything else is `text-title` or smaller.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib/ui-guard
npm run dev
```

Then look at it, and do this specific sequence: add five stops to a plan, drag the
budget slider, and confirm the tab does not freeze. That is the `C(60,k)` test and
it is the difference between a demo that works and a demo that hangs. Then read the
screen top to bottom and confirm every sentence is one you can source.

## Definition of done

1. The validation stamp renders real `drift` and real `satisfiedFraction`, and a
   drifted plan is shown as failed, not as valid.
2. The fabricated clock is gone. Either a real clock from a visible start time, or
   no clock. Stated which.
3. "Selected because it matches the current interest" is gone.
4. `generatePlanVariants` is no longer called. Five stops does not freeze.
5. The `allExperiences.find` "recommendation" and its false copy at `:132` are gone.
6. The relaxation note names the rung and the cost, from the engine.
7. Session 7, 8 and 9 components are integrated by import. No stubs written.
8. `aria-live="polite"` on the solving and replan region.
9. All nine `UiState` values render something deliberate on this screen.
10. `git status --short` shows only your three path patterns.
11. Your summary quotes the validation stamp's actual output from a real run.
