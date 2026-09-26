# SESSION 9 of 10 — Traveller UI: The Feasibility Meter and the Thesis Made Visible

> Copy everything below this line into a new session.

---

You are session 9 of 10 working simultaneously on **ANANTA**, a fit-first local
discovery engine at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

The engine exists to make one sentence possible: **this fits, and here is the
proof.** You own every screen the traveller sees. The feasibility meter is the
signature UI element of this project and the single most important thing you build.

## Read first

1. `MASTERPLAN.md` sections 3.4, 3.5, 4 and 7.
2. `SESSION/00-CONTRACTS.md` **completely**. You consume the engine through
   `@/lib/engine` only.
3. Every file in `app/` and `components/`. They are small. Read all of them.
4. `docs/05-design/DESIGN-CONTRACT.md`, `docs/05-design/CONTENT-STYLE-GUIDE.md`,
   `docs/05-design/ACCESSIBILITY.md`, `docs/06-quality/DESIGN-REVIEW-CHECKLIST.md`.
   The app already honours most of them and you must not regress that.

## What is honestly good already, and must survive your work

This codebase is more honest than average. Do not break it:

- `app/explore/page.tsx:227-236`, a `ConfidenceLegend` that explains every trust
  tier. Rare and good. Keep it and extend it.
- `app/experience/[id]/page.tsx:28-29`, which tells the user whether the pin is
  real.
- `app/profile/page.tsx:60`, "This is a fixed demo position, not live
  geolocation", and `:78`, "no behavioral profile is built in this prototype".
  **The second one becomes false when you ship the learned-weights panel. Rewrite
  it honestly rather than deleting it.**
- `app/trips/page.tsx:137`, "These options use demo prices and access-time
  estimates. They are not live availability claims."
- `lib/routing.ts:39-41, 179-186`, which labels the straight-line fallback instead
  of faking a route.
- `app/layout.tsx:14` skip link with a working focus reveal, and
  `app/globals.css:114-117` reduced-motion handling. Keep both.
- `PAGE_SIZE = 24` at `app/explore/page.tsx:19` with a show-more control. The list
  never mounts more than 24 cards. Keep that discipline.

## Defects you own, all of them

### Fabrications in user-facing copy

1. `app/trips/page.tsx:126`:
   ```tsx
   <p>{index === 0 ? "Start" : `${index + 1}:15 PM`}</p>
   ```
   A string template presented in bold blue as a schedule. Stop 2 is always
   "2:15 PM". It does not read `availableMinutes`, does not read the deadline, does
   not sum previous durations. **Either compute a real clock from
   `arriveBy` plus `visitMinutes` plus a start time the traveller picks or sees
   stated, or delete the clock and show `stop N` plus the real durations.** A
   fabricated clock is the worst honesty defect in the repository.
2. `app/trips/page.tsx:126`: "Selected because it matches the current interest and
   sits inside the available plan area." Printed identically for every stop. No
   interest model existed and no area check ran. Replace with the real ranked
   components from session 4's `explainStop`.
3. `app/trips/page.tsx:132`: "This option removes the weather-dependent stop and
   keeps the rest of the plan within the current area." The suggestion is
   `allExperiences.find(...)`, the first non-amber record in array order at `:94`,
   ignoring location, budget, time and area. **Both clauses are false.** Delete
   both sentences; session 7's replan now chooses properly and can supply a real
   reason.
4. `app/layout.tsx:6`, the site-wide meta description: "Find **verified** local
   experiences". About 96% of the catalogue is generated, with hash-derived prices
   and durations, and `factory.ts:134` says so in its own `confidence` string. This
   is the first thing any visitor or crawler reads. Rewrite it truthfully.
5. `app/provider/page.tsx:88` "Update availability, capacity, and listing details".
   `capacity` does not exist on `ProviderListing` and listing details are immutable
   after seed. Session 10 owns that file; report it in your blockers file with the
   exact line rather than editing across from them.
6. `components/travel-options.tsx:47`: "**Live** estimates from Marine Drive
   promenade, from OpenStreetMap routing. Not live traffic." Self-contradicting in
   one sentence, and it fires even when `route.kind === "estimate"`, at which point
   `:60` correctly says "Straight-line estimate; routing unavailable." Make the
   leading word follow `route.kind`.
7. Four shipped strings violate the repo's own em dash ban, which
   `DESIGN-CONTRACT.md:28`, `CONTENT-STYLE-GUIDE.md:16`,
   `DESIGN-REVIEW-CHECKLIST.md:21` and `DEFINITION-OF-DONE.md:18` all state:
   `components/availability-picker.tsx:72`, `:73`,
   `components/discovery-search.tsx:33`, `app/profile/page.tsx:95`. Session 10 adds
   the lint rule that catches new ones. Fix these four.
8. `app/explore/page.tsx:127`: "With no filters, nearest places rank first." False
   for the tie group. With zero constraints the score is `proximityBonus` bucketed
   at 3/2/1/**0**, so everything beyond 10 km scores exactly 0 and is then ordered
   alphabetically by the name tiebreak at `recommendation.ts:73`. Fix the tiebreak
   to fall back to distance, or fix the sentence. Fix the tiebreak.

### Broken and missing

9. **Dead controls, two of them primary CTAs.**
   `components/discovery-search.tsx:33` "See what is nearby" is the hero CTA on the
   landing page and has no `onClick`, no `href`, no `type`. A judge clicks the
   primary button and nothing happens. `app/events/page.tsx:16` every "View event"
   button is dead; there is no `/events/[id]` route. Also dead:
   `app/explore/page.tsx:166` "Apply search", `app/page.tsx:25` the "Mumbai" city
   selector, `app/experience/[id]/page.tsx:35` "Share experience". Fix or remove
   each one. A control that does nothing is worse than no control.
10. `app/experience/[id]/page.tsx:34`, `?? allExperiences[0]`, means
    `/experience/anything-garbage` returns HTTP 200 rendering Kala Ghoda Art Walk.
    Use `notFound()`.
11. **Two inconsistent "add to plan" implementations.** `app/explore/page.tsx:240`
    is add-only, so the label flips to "Added to plan" and re-clicking rewrites the
    same array. `components/plan-button.tsx:15` is a real toggle. A user who removes
    a place on the detail page and returns to Explore sees "Add to plan" again.
    One implementation, used in both places.
12. **No footer anywhere.** `/privacy` and `/terms` are desktop-top-nav-only, so
    they are unreachable on the mobile demo viewport, which `ITERATIVE-BROWSER-QA.md:29`
    calls the primary one. Add a footer with Privacy, Terms and the provider and
    operations links. This also fixes the next point.
13. **`/provider` and `/admin/operations` have zero inbound links** anywhere in the
    app. `DEMO-SCRIPT.md:47-49` instructs the presenter to open both mid-demo. The
    footer and the bottom nav fix this.
14. **The map explodes at zoom 14.** `components/map.tsx:127` in Explore passes all
    ~1107 records. `lib/cluster.ts:12-17` returns `undefined` cell size at zoom
    >= 14, which **disables clustering entirely** and yields all 1107 points, one
    DOM `maplibregl.Marker` each with a click listener and a Popup. Selecting a
    place calls `map.flyTo({ zoom: 13 })`, one step away. Also `lib/cluster.ts:37`
    does `items.find(...)` inside a `.map()`, which is O(n squared), about 1.1M
    operations per re-cluster, and the effect re-runs on every zoom change. Cap the
    marker count and fix the quadratic. `lib/cluster.ts` is not yours; fix the
    caller in `components/map.tsx` and report the underlying issue in your blockers
    file.
15. **`Popup.setHTML()` with unescaped venue names** at `components/map.tsx:59` and
    `:83`. 1107 names flow into an `innerHTML` sink, and
    `.github/workflows/refresh-geocode.yml` rewrites that data from Overpass every
    month. Session 10 is adding a CSP, which will break this. Escape it, or use
    `setDOMContent` with real nodes. Do not leave it.
16. **`ExcludedList` renders unbounded** at `app/explore/page.tsx:238`. With a loose
    filter set, `allExcluded` can be about 1000 divs. Cap it and show "and N more".
17. **Zero focus-visible styling.** `app/globals.css` has exactly one focus rule,
    `.skip-link:focus` at `:129`. Every input pairs `outline-none` with
    `focus:border-blue`, which is a border shift, not a focus ring. Buttons and
    links have nothing. `DESIGN-CONTRACT.md:42` mandates it. Add a real
    `:focus-visible` token to `tailwind.config.ts`... which is not yours. So add
    the rule to `app/globals.css` and report the token request in your blockers
    file.
18. **The report dialog claims `aria-modal` and does not trap focus.**
    `components/report-button.tsx:34`. Also no focus restoration on close. Either
    implement the trap with about fifteen lines or drop `aria-modal`. A lie in ARIA
    is worse than no ARIA.
19. **The map is a keyboard trap of dead space.** `components/map.tsx:158` puts an
    `aria-label` on a non-interactive div, and individual markers at `:85` are
    MapLibre-created divs with no role, no tabindex and no label. Cluster badges at
    `:71-76` are real buttons. `ACCESSIBILITY.md:3` requires full keyboard
    navigation and `:12` requires accessibility metadata on the detail page, which
    will exist once session 8 ships `access`. Make markers focusable with a label,
    or make the list the documented single path and say so in the UI.

## The six thesis elements, and their current state

| Element | State | Your job |
|---|---|---|
| Feasibility meter | **Partial.** Four flat tiles at `app/trips/page.tsx:78-83`. `evaluation.bufferMinutes` is computed at `plan.ts:52` and **never displayed**, merged into one "Travel and buffer" tile at `:81`. No remaining-window bar anywhere. | **Build it.** `activity ▸ travel ▸ buffer` as a single proportional bar against `ctx.availableMinutes`, overflow in the alarm colour, buffer visually distinct from travel. This is the signature element. Get the buffer its own segment and its own number. |
| Why this | **Partial.** `app/explore/page.tsx:221` renders `reasons.slice(0, 3)`, in the fixed `if` order of `recommendation.ts:55-69`, and **the score is computed at `recommendation.ts:73` then discarded**. No numbers, no ranking. | Session 4's `explainStop`, sorted by descending absolute contribution, each with its number. The top contributor first. |
| Why not that | **Partial.** `app/explore/page.tsx:238` lists every rejection in one flat div, collapsed by default, never tied to what the traveller typed, no near-misses. | A panel keyed to the specific thing they tapped. Typed `Rejection` with the code, the sentence and the shortfall, plus the **single cheapest constraint to relax** and how many more options that would unlock. Cap the bulk list. |
| Provenance badges | **Absent per field.** One `confidence` string per record, conflating location provenance with operational factuality. `factory.ts:133` reads "Location matched on OpenStreetMap; visit facts are demo estimates", so you cannot tell that the price is fabricated and the hours are unverified. | A per-field badge from session 8's `fieldSource`. "Price: inferred, low confidence" is a different claim from "Coordinates: OSM, verified". Extend the existing `ConfidenceLegend`. |
| What I learned about you | **Absent.** Zero occurrences of "learned" in the codebase. `app/profile/page.tsx:78` disclaims it. | Session 4's weights and bandit state, rendered as editable sliders with the current value, the prior, and the observation count. Nothing is learned without being visible and editable. Rewrite the `profile/page.tsx:78` disclaimer truthfully. |
| Stress Radar | **Absent.** Zero occurrences of "radar" anywhere. | 7 weighted dimensions, 0 to 100, one concrete rescue move for the single worst factor. |

## ALLOWED — you own these files, exclusively

```
app/layout.tsx
app/globals.css
app/page.tsx
app/explore/page.tsx
app/explore/**
app/trips/page.tsx
app/experience/[id]/page.tsx
app/events/page.tsx
app/profile/page.tsx
app/saved/page.tsx
app/explore-not-found handling via app/experience/** only
components/ui.tsx
components/map.tsx
components/discovery-search.tsx
components/travel-options.tsx
components/experience-media.tsx
components/availability-picker.tsx
components/report-button.tsx
components/save-button.tsx
components/plan-button.tsx
components/plan-badge.tsx
components/footer.tsx
components/ananta/**          new namespace, all your new components live here
SESSION/BLOCKERS/9.md
```

Put every new component in `components/ananta/`. That directory is yours alone, so
you will never collide on a filename. Suggested: `feasibility-meter.tsx`,
`why-this.tsx`, `why-not-that.tsx`, `provenance-badge.tsx`, `learned-weights.tsx`,
`stress-radar.tsx`, `replan-proposal.tsx`.

## FORBIDDEN

```
app/provider/**            session 10
app/admin/**               session 10
app/terms/**  app/privacy/**   session 10 owns legal copy
lib/**                     sessions 1 to 8 and 10
lib/seed.ts  lib/data/**    session 8 / frozen
docs/**  scripts/**  .github/**
package.json  tsconfig.json  .eslintrc.json  vitest.config.ts  next.config.mjs
app/trips/page.tsx is yours, but lib/plan.ts is NOT: leave generatePlanVariants alone
```

**`lib/plan.ts:88-95` is an OOM on the render path and session 5 is rewriting the
algorithm.** Do not fix it yourself and do not build a UI workaround for it. Stop
calling `generatePlanVariants` from `app/trips/page.tsx:35` and consume session 5's
`pack()` instead. If session 5 has not landed, show an honest "solving" state and
report the dependency in your blockers file. Do not paper over it with a `slice`.

## Task

### 1. Cut over to the engine

`app/explore` and `app/trips` must consume `@/lib/engine` and nothing from
`lib/recommendation.ts` or `lib/quick-filters.ts`. The pipeline order is
**retrieve, then gate, then score, then pack, then validate, then relax.** The
current code gates and scores in one loop and then runs quick filters as a
*second* gate after ranking (`explore/page.tsx:94-97`), so excluded records get
scored, sorted, and their score discarded. Fix the order.

Build the index once in a `useMemo` keyed on the record array, not on the query.
Wrap the solve in a transition or an effect so typing in a filter does not block
the main thread. Show the retrieval count: "120 of 1107 considered" makes stage 1
visible and is one line of copy.

### 2. Build the six thesis elements

Each one gets real data from the engine, a finished sentence, and a visible
provenance. None of them may be a static string. The existing
`Why: {item.reasons.slice(0, 3).join(" · ")}` pattern is the anti-pattern.

### 3. Honest replanning UX

Session 7 returns a `ReplanResult` with `Swap[]`, each carrying a reason and a
score delta. Render it as a **proposal with an explicit accept control**. The
masterplan is unambiguous: normal adaptation is always user-controlled, never
silent. Show what changed, why, what it affects, and the score delta. Three
controls: accept, view alternatives, keep original. All six triggers get a
one-click control.

### 4. Footer and navigation

One footer with Privacy, Terms, Provider, Operations. Add Provider and Operations
to a nav that is reachable on mobile. Kill the five dead controls. `notFound()` for
unknown experience ids. One add-to-plan implementation.

### 5. Accessibility, and the two ARIA lies

Real `:focus-visible` styling. A working focus trap and focus restoration in the
report dialog, or drop `aria-modal`. Keyboard-reachable map markers, or an explicit
statement in the UI that the list is the accessible path. Keep the skip link, keep
reduced motion, keep `alt` text honest.

## Constraints

- **Zero new dependencies.** No component library. `components/ui.tsx` is 21 lines
  and 3 exports, and that is fine; the app looks consistent because the copy is
  disciplined, not because there is a design system.
- **No em dash (U+2014) and no emoji in any user-facing string.** Five docs in this
  repo ban it and four shipped strings violate it. Session 10 adds the lint rule.
- **Every claim in the UI must be backed by data you can name.** If you cannot
  point at the field, delete the sentence. This is the whole project.
- The legacy `lib/recommendation.ts` and `lib/quick-filters.ts` become dead code when
  you finish. **Do not delete them**; session 10 owns the final cleanup and there
  are still tests referencing them. Note it in your blockers file.

## Verification

```
npm ci
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib
```

Then start the app and check by hand, because a build passing is not a UI working:

```
npm run dev
```

Walk the demo path: land, search, explore, filter, open a place, add to plan, build
a plan, read the meter, fire a trigger, read the proposal, accept it, read the swap
reasons. Check at 390px and at 1440px. Check that no console errors appear.
Report what you actually observed, not what you expected.

## Definition of done

1. No fabricated clock, no "selected because it matches the current interest", no
   "keeps the rest of the plan within the current area", and the meta description no
   longer says "verified".
2. All five dead controls are either wired or removed. No dead control remains on
   any route you own.
3. The six thesis elements all render real engine data. None is a static string.
4. The feasibility meter shows activity, travel **and buffer as three distinct
   segments**, with the remaining window and an overflow state in the alarm colour.
5. `app/explore` and `app/trips` import nothing from `lib/recommendation.ts` or
   `lib/quick-filters.ts`, and the order is retrieve, gate, score, pack, validate,
   relax.
6. The map survives zoom 14 without a freeze, and the `setHTML` sink is gone.
7. A footer exists, `/provider` and `/admin/operations` are reachable, `/privacy`
   and `/terms` work on mobile, and an unknown experience id 404s.
8. `:focus-visible` styling exists, and the report dialog either traps focus
   correctly or does not claim `aria-modal`.
9. No em dash, no emoji, no new dependencies.
10. Your summary lists every sentence you deleted and why, because on this project
    the deletions are the work.
