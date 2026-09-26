# SESSION 9 of 10 — Disruption: Replan, Events, and Availability

> Copy everything below this line into a new session.

---

You are session 9 of 10 in the **UI/UX fix round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You own everything that **changes over time**, and the problem statement's central
demand: the system must adapt **without breaking intent**.

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**. RULE 0, the copy rules in
   section 3, your row in section 6.
2. `SESSION/UI-UX-DESIGN.md` sections 4, 5 and 6.4.
3. `lib/engine/replan/` in full: `triggers.ts`, `swap.ts`, `minimality.ts`,
   `context.ts`, `replan.ts`, plus their tests. **These are the best-implemented
   files in the project.** `context.ts` deep-freezes `original` and
   `cloneForMutation` copies it by reference, which is what makes "diff against
   original, forever" true by construction. Read the tests, they are the spec.
4. `components/ananta/replan.ts` (222 lines), `replan-proposal.tsx` (163 lines),
   `app/events/page.tsx` (7375 bytes), `components/availability-picker.tsx` (3106
   bytes), `lib/events.ts`.

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
tailwind.config.ts, app/globals.css, components/ananta/tokens.ts, records.ts, lib/ui-guard/**   session 1
components/ananta/pipeline.ts, use-ananta.ts                                                   session 2
app/layout.tsx, app/page.tsx, app/contact/**, components/footer.tsx, components/ui.tsx         session 3
app/explore/**, components/map.tsx, discovery-search.tsx, travel-options.tsx                     session 4
app/trips/**, components/ananta/feasibility-meter.tsx                                          session 5
app/experience/**, provenance-badge.tsx, experience-media.tsx, report-button.tsx                 session 6
components/ananta/why-this.tsx, why-this-live.tsx, why-not-that.tsx, learning.ts,
  plan-button.tsx, plan-badge.tsx, save-button.tsx, share-button.tsx                              session 7
components/ananta/stress-radar.tsx, learned-weights.tsx, app/profile/**, app/saved/**            session 8
app/provider/**, app/admin/**, app/terms/**, app/privacy/**                                    session 10
lib/**   FROZEN
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, vitest.config.ts, docs/**
```

**Your new components go in `components/ananta/replan/`.** That directory is yours
alone. Session 5 will import from it to place your proposal on the Trips screen, so
export it cleanly and do not require them to edit your files.

## Task

### 1. The replan proposal is the demo. Make it land.

`MASTERPLAN.md` section 4 is unambiguous: **normal adaptation is always
user-controlled, never silent.** The worked example in the masterplan:

```
Situation changed
Outdoor activity is affected by rain.
Preserving your original goal: LOCAL + CULTURAL EXPERIENCE
Finding indoor alternatives...
Alternative 1 / Alternative 2 / Alternative 3
```

Three things must be true on screen, in this order:

1. **What changed.** The trigger, in a plain sentence. "It started raining."
2. **What is being preserved.** The original intent, named explicitly. This is the
   architectural centrepiece of the product, and the masterplan's principle 3 is
   *never replace the traveller's intent*. If the traveller asked for local and
   cultural and you swap in a shopping mall, the failure is not the swap, it is the
   silent substitution. Name the intent back to them so they can catch it.
3. **What is proposed, with consequences.** Each alternative with its reason and its
   **score delta**, which `Swap[]` already carries.

And three controls: **accept**, **view alternatives**, **keep original**. All three.
`keep original` must be a real first-class option, not a dismiss, because sometimes
the right answer is to do nothing.

**The number of swaps is the demo metric: median 2 or fewer per context change.**
Render the actual count. If it is 4, show 4. Do not trim the list to look good; a
replan that needed 4 swaps is information.

### 2. Six triggers, one click each

From `lib/engine/replan/triggers.ts`: `rain_started`, `time_lost`, `sold_out`,
`budget_dropped`, `needs_restroom`, `tired`.

All six need a visible, labelled, one-click control somewhere sensible. Session 5
places the panel on Trips; you export the trigger controls for them to use, and you
put the `sold_out` and availability ones on the surfaces where they belong.

Each control must state **what it will simulate** before it is pressed. A button
labelled "It started raining" that silently rewrites the traveller's context is a
trap. The masterplan's own framing is that this is a demo of a trigger, so say so.

**One thing you must not break.** The `rain_started` trigger sets `raining: true` and
`weatherSeverity`. It does **not** add anything to `profile.avoid`. The weather
changed; the traveller did not decide they hate rain. `replan/context.test.ts`
asserts this and it is the cleanest expression of intent preservation in the
codebase. Keep that behaviour and, if you surface the traveller's stated
preferences anywhere near the proposal, do not let a trigger's effect appear in
them.

### 3. `components/availability-picker.tsx` — three real defects

**The copy at `:72` and `:73` has em dashes.** "Slots typically available — confirm
with the venue" and "Limited slots — call ahead to confirm". `docs/05-design/DESIGN-CONTRACT.md:28`
bans em dashes in product copy, `CONTENT-STYLE-GUIDE.md:16` repeats it, and four
shipped strings violate it. Session 1's `lib/ui-guard/no-legacy-copy.test.ts` will
fail your build until you fix them. Use a full stop.

**The status dot at `:68` is `aria-hidden="true"` with no text equivalent.**
`docs/05-design/ACCESSIBILITY.md:8` requires that status is never conveyed by colour
alone. The text does exist at `:72-73`, so the fix is small: make sure the dot is
decorative *because* adjacent text carries the state, and that the pair is read as
one unit.

**The "demo data" disclosure is right. Keep it.** `:47` says "Demo data" and `:77`
says "Demo availability pattern, not a live feed." Both are correct and required by
`docs/05-design/DESIGN-CONTRACT.md:18`, which bans fake live-availability claims.
Do not soften them, and do not let a "Confirm with the venue" affordance imply a
booking flow exists. There are no bookings. `MASTERPLAN.md` section 9 says requests,
not transactions.

`aria-pressed` at `:54` is correct. Keep it.

### 4. `app/events/page.tsx` — every "View event" button is dead

There is no `/events/[id]` route. Every card's primary action does nothing, and a
judge will press one. Three options, and pick one deliberately:

- **Build `app/events/[id]/page.tsx`.** You own `app/events/**`, so the route is
  yours. It is the better product: an event with a real time window is a real
  constraint input, and `lib/events.ts` already computes whether an event is still
  reachable from the traveller's position.
- **Make the card itself the target**, with the button as a real `Link` to the
  explore view filtered to that event's area and time. Cheaper, and it connects
  events to the engine rather than making them a dead-end feature.
- **Remove the button** and make the whole card informational.

`lib/events.ts:52-53` has two honest rejections worth surfacing properly: "This demo
event window has already passed" and "Starts in {gap} minutes but needs about {n}
minutes to reach." The second is a `travel_time_exceeds_budget` rejection in
disguise, so **use the real `Rejection` type and the real sentence builders** from
the engine rather than bespoke strings. RULE 0 forbids reimplementing, and this is
exactly the case it covers.

`lib/events.ts:40-46` computes venue and time changes against a `previousVenue`
snapshot. **Show the change**, because that is the product noticing reality moved.
`eventChanges` already returns the diff.

`MASTERPLAN.md` section 9 and `docs/04-data/EVENT-INGESTION.md` both require expiry
data on every event. If any event lacks it, that is a blocker for session 8, not
something to paper over.

### 5. The `UiState` coverage

`sold-out` and `solving` are the two that are yours above anyone else's.

`sold-out` must state the **fact and its timestamp**, then offer the replan. It must
not read as an error, because a sold-out slot is information about the world, not a
failure of the software. And it must not be the only place the traveller learns
about it: session 5's feasibility meter needs to know about a sold-out stop, so
export the availability state in a form they can consume.

`solving` shows the **stage**, not a spinner.

`broken` names what failed and what still works. `routing-down` renders the labelled
straight-line estimate.

## Constraints

- **RULE 0: no engine in the view layer.** `applyTrigger`, `diffAgainstOriginal`,
  `buildContext`, `dominantRejection`, `REJECTION_CODES`, `TRIGGERS` come from
  `@/lib/engine` or your own `replan.ts` export surface. If the engine lacks a
  sentence, it is a blocker, not a bespoke string.
- Zero new dependencies.
- No em dash, no emoji. No hard-coded dataset number.
- **Never apply a replan silently.** `applyTrigger` returns a *proposal*. Rendering
  it and letting the traveller accept is the only correct behaviour, and the code
  contract already reflects that by returning a proposal rather than mutating.
- One `text-display` per screen.
- Every timestamp you render comes from the record. `app/provider/page.tsx:11` has a
  hardcoded `const TODAY = "2026-09-09"` which is session 10's file; do not copy
  that pattern.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib/ui-guard lib/engine/replan
npm run dev
```

Then do the actual demo, in this order: build a plan, fire "it started raining",
read the proposal, **check that the preserved intent is named on screen**, check the
swap count, accept, and read the reason on each swap. Then fire "they're tired" and
confirm the traveller's stated preferences did **not** change. That second check is
the intent-preservation test and it is the most important thing you verify.

## Definition of done

1. The proposal shows what changed, what intent is preserved, and what is proposed,
   in that order, with a real score delta per swap.
2. Accept, view alternatives, and keep original are all real controls.
3. The actual swap count is displayed, untrimmed.
4. All six triggers have labelled one-click controls that state what they simulate.
5. A trigger's effect never appears in the traveller's stated preferences.
6. Both em dashes at `availability-picker.tsx:72-73` are gone, and the status dot has
   a real text equivalent.
7. Every "View event" button either navigates or is removed. None is dead.
8. Event sentences come from the real `Rejection` builders, not bespoke strings.
9. Event changes against the previous snapshot are surfaced.
10. `sold-out` and `solving` render as deliberate states, and the sold-out
    availability state is exported for session 5's meter.
11. `git status --short` shows only your five path patterns.
12. Your summary quotes the swap count from a real run of each trigger.
