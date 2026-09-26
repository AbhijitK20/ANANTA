# SESSION 9 of 10 — Disruption: Replan, Events, and Availability

> Copy everything below this line into a new session.

---

You are session 9 of 10 in the **spatial UI round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You own everything that **changes over time**, and the problem statement's central
demand: the system must adapt **without breaking intent**.

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**. Section 6 encoding 5 (answer
   quality is height) is largely yours, section 4 is your motion budget, section 3
   is your copy rules.
2. `SESSION/UI-UX-DESIGN.md` sections 4, 5 and 6.4.
3. `lib/engine/replan/` in full: `triggers.ts`, `swap.ts`, `minimality.ts`,
   `context.ts`, `replan.ts` and their tests. **These are the best-implemented files
   in the project.** `context.ts` deep-freezes `original` and `cloneForMutation`
   copies it by reference, which is what makes "diff against original, forever" true
   by construction. Read the tests, they are the spec.
4. `components/ananta/replan.ts` (222 lines), `replan-proposal.tsx` (163 lines),
   `app/events/page.tsx` (7375 bytes), `components/availability-picker.tsx`
   (3106 bytes), `lib/events.ts`.

## The idea that makes your screen work

> **Answer quality is height. The relaxation ladder is a ladder, visually.**

| Rung | Depth |
|---|---|
| `strict` | `depth-lifted` |
| `dropped_minimum` | `depth-raised` |
| `greedy_fill` | `depth-flush` |
| `single_best` | `depth-recessed` |

"We settled for one stop" is now visibly lower than "we found exactly what you asked
for". `MASTERPLAN.md` says *"Relaxed: minimum 1 stop instead of 2" is a far better
demo than an unsat core."* This is that sentence, expressed in space.

And the same grammar applies to your alternatives: the best one `depth-lifted`, the
rest stepping down. A traveller scans a height gradient and understands the quality
ranking before reading a word, which is exactly the read you want them to have.

**Always render the rung's name and its cost in text too.** Depth is a redundant
encoding, not a replacement, and a rung that is only communicated in Z fails anyone
who cannot perceive depth.

## ALLOWED — you own these, exclusively

```
components/ananta/replan.ts
components/ananta/replan-proposal.tsx
app/events/**
components/availability-picker.tsx
components/ananta/replan/**
UI-UX-Fix-Prompts/BLOCKERS/9.md
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
components/ananta/stress-radar.tsx, learned-weights.tsx, app/profile/**, app/saved/**     session 8
app/provider/**, app/admin/**, app/terms/**, app/privacy/**                     session 10
lib/**   FROZEN
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, vitest.config.ts, docs/**
```

New components go in `components/ananta/replan/`. Yours alone. Session 5 imports from
it to place your proposal on Trips, so export it cleanly.

## Task

### 1. The replan proposal is the demo. Make it land.

`MASTERPLAN.md` section 4: **normal adaptation is always user-controlled, never
silent.** The worked example:

```
Situation changed
Outdoor activity is affected by rain.
Preserving your original goal: LOCAL + CULTURAL EXPERIENCE
Finding indoor alternatives...
Alternative 1 / Alternative 2 / Alternative 3
```

Three things on screen, in this order:

1. **What changed.** The trigger, in a plain sentence. "It started raining."
2. **What is being preserved.** The original intent, named explicitly. This is the
   architectural centrepiece. If the traveller asked for local and cultural and you
   swap in a shopping mall, the failure is not the swap, it is the silent
   substitution. **Name the intent back so they can catch it.**
3. **What is proposed, with consequences.** Each alternative with its reason and its
   **score delta**, which `Swap[]` already carries.

Three controls: **accept**, **view alternatives**, **keep original**. All three.
`keep original` is a real first-class option, not a dismiss, because sometimes the
right answer is to do nothing.

**The number of swaps is the demo metric: median 2 or fewer.** Render the actual
count. If it is 4, show 4. Do not trim the list to look good, because a replan that
needed 4 swaps is information.

**Depth on this screen.** The proposal panel is `depth-floating`, the page behind it
recedes, and the alternatives step down by score. The **intent-preservation line is
`depth-lifted`**, because it is the most important sentence on the screen and it
should be the thing the eye lands on first. That is a deliberate exception to "lifted
means primary recommendation", and it is justified because the preserved intent is
the claim the whole screen exists to protect.

**The page push-back treatment is conditional.** Session 6 owns the dialog focus
trap, and if focus is not trapped then pushing the page back is a lie about where
you are. Check whether the trap landed; if it did not, **do not push the page back**
and write a blocker naming session 6.

### 2. Six triggers, one click each

`rain_started`, `time_lost`, `sold_out`, `budget_dropped`, `needs_restroom`,
`tired`. All six need a visible, labelled, one-click control. Session 5 places the
panel on Trips; you export the controls and you put the availability ones where they
belong.

**Each control must state what it will simulate before it is pressed.** A button
labelled "It started raining" that silently rewrites the traveller's context is a
trap. This is a demo of a trigger, so say so.

**Trigger buttons are `depth-flush` and do not lift on hover.** They are actions,
and session 7's rule applies here too: a control whose depth changes on hover has
stopped meaning anything.

**One thing you must not break.** `rain_started` sets `raining: true` and
`weatherSeverity`. It does **not** add anything to `profile.avoid`. The weather
changed; the traveller did not decide they hate rain. `replan/context.test.ts` asserts
this and it is the cleanest expression of intent preservation in the codebase. If
you surface the traveller's stated preferences anywhere near the proposal, **a
trigger's effect must never appear in them.**

### 3. `components/availability-picker.tsx` — three defects

**The copy at `:72` and `:73` has em dashes.** "Slots typically available — confirm
with the venue" and "Limited slots — call ahead to confirm".
`docs/05-design/DESIGN-CONTRACT.md:28` bans em dashes in product copy,
`CONTENT-STYLE-GUIDE.md:16` repeats it, and four shipped strings violate it. Session
1's guard test will fail your build until you fix them.

**The status dot at `:68` is `aria-hidden="true"` with no text equivalent.**
`ACCESSIBILITY.md:8` requires that status is never conveyed by colour alone. The
text does exist at `:72-73`, so make sure the dot is decorative *because* adjacent
text carries the state, and that the pair reads as one unit.

**The "demo data" disclosures are right. Keep them.** `:47` says "Demo data" and
`:77` says "Demo availability pattern, not a live feed." Both are required by
`DESIGN-CONTRACT.md:18`, which bans fake live-availability claims. Do not soften
them, and do not let a "Confirm with the venue" affordance imply a booking flow.
There are no bookings; `MASTERPLAN.md` section 9 says requests, not transactions.
`aria-pressed` at `:54` is correct. Keep it.

**Depth on availability is state, and it is one of the cleanest cases you will get.**
`open` is `depth-raised`, `limited` is `depth-flush` with the amber tone, `closed` is
`depth-recessed` with the dashed treatment. A closed slot is *recessed*, not red,
because it is information about the world rather than an error, and recessing it
points the traveller at the replan instead of at a red wall.

### 4. `app/events/page.tsx` — every "View event" button is dead

There is no `/events/[id]` route. Every card's primary action does nothing, and a
judge will press one. **A lifted card with a dead button is worse than a flat one**,
because the elevation is an invitation. Three options, pick one deliberately:

- **Build `app/events/[id]/page.tsx`.** You own `app/events/**`, so the route is
  yours, and an event with a real time window is a real constraint input.
- **Make the card the target**, with the button as a real `Link` to explore filtered
  to that event's area and time. Cheaper, and it connects events to the engine rather
  than making them a dead-end feature.
- **Remove the button** and make the card informational.

`lib/events.ts:52-53` has two honest rejections worth surfacing properly: "This demo
event window has already passed" and "Starts in {gap} minutes but needs about {n}
minutes to reach." **The second is a `travel_time_exceeds_budget` rejection in
disguise, so use the real `Rejection` type and the real sentence builders** rather
than bespoke strings. RULE 0 forbids reimplementing, and this is exactly the case it
covers.

`lib/events.ts:40-46` computes venue and time changes against a `previousVenue`
snapshot. **Show the change**, because that is the product noticing reality moved.
`eventChanges` returns the diff.

`MASTERPLAN.md` section 9 and `docs/04-data/EVENT-INGESTION.md` both require expiry
on every event. If any lacks it, that is a blocker for session 8, not something to
paper over.

### 5. `UiState` coverage

`sold-out` and `solving` are yours above anyone else's.

`sold-out` states the **fact and its timestamp**, then offers the replan. It must
not read as an error, because a sold-out slot is information about the world, not a
failure of the software. **And it must not be the only place the traveller learns
about it**: session 5's meter needs to know, so export the availability state in a
form they can consume.

`solving` shows the **stage**, not a spinner. `broken` names what failed and what
still works. `routing-down` renders the labelled straight-line estimate.

## Constraints

- **RULE 0: no engine in the view layer.** `applyTrigger`, `diffAgainstOriginal`,
  `buildContext`, `dominantRejection`, `REJECTION_CODES`, `depthForRung` come from
  `@/lib/engine` or your own `replan.ts` export surface.
- **Class names only.** No `style={{ transform }}`. The alternatives' depth is a
  class from `RUNG_DEPTH`, not a computed Z.
- Zero new dependencies. No motion library.
- No em dash, no emoji, no hard-coded dataset number, and **no hard-coded demand
  number**, which is the same rule applied to a number session 10 will find invented.
- **Never apply a replan silently.** `applyTrigger` returns a *proposal*. Rendering
  it and letting the traveller accept is the only correct behaviour.
- One `text-display` per screen.
- Every timestamp comes from the record. `app/provider/page.tsx:11` has a hardcoded
  `const TODAY = "2026-09-09"`; that is session 10's file, but do not copy it.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib/ui-guard lib/engine/replan
npm run dev
```

Then the actual demo, in order: build a plan, fire "it started raining", read the
proposal, **check the preserved intent is named and lifted on screen**, check the
swap count, accept, read each swap's reason. Then fire "they're tired" and **confirm
the traveller's stated preferences did not change.** That second check is the
intent-preservation test and it is the most important thing you verify.

Then: emulate reduced motion and confirm the rung gradient is still readable from
tone and text alone, and that no trigger button lifts on hover.

## Definition of done

1. The proposal shows what changed, what intent is preserved, and what is proposed,
   in that order, with a real score delta per swap.
2. Accept, view alternatives and keep original are all real controls.
3. The actual swap count is displayed, untrimmed.
4. The intent line is `depth-lifted` and named in text.
5. The rung gradient is expressed as height **and** named in text.
6. All six triggers have labelled controls that state what they simulate, and none
   changes depth on hover.
7. A trigger's effect never appears in the traveller's stated preferences.
8. Both em dashes at `availability-picker.tsx:72-73` are gone, and the status dot has
   a real text equivalent.
9. Availability depth is raised, flush, recessed for open, limited, closed.
10. Every "View event" button navigates or is removed. None is dead.
11. Event sentences come from the real `Rejection` builders, and event changes
    against the previous snapshot are surfaced.
12. `sold-out` and `solving` render as deliberate states, and the sold-out state is
    exported for session 5's meter.
13. The page push-back is applied only if session 6's focus trap landed.
14. `git status --short` shows only your five path patterns.
15. Your summary quotes the swap count from a real run of each trigger, and states
    whether you pushed the page back.
