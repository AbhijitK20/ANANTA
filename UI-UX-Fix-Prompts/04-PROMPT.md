# SESSION 4 of 10 — Explore: the Workspace Where Retrieval Becomes Visible

> Copy everything below this line into a new session.

---

You are session 4 of 10 in the **UI/UX fix round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You own the screen where a traveller decides whether to trust the engine. It is the
busiest surface in the product and the one where an honest number is most likely to
be quietly dropped.

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**. RULE 0 and RULE 1 especially.
2. `SESSION/UI-UX-DESIGN.md` sections 5, 6.2 and 7.
3. `app/explore/page.tsx` (26KB, the largest page in the repo),
   `components/map.tsx` (8KB), `components/discovery-search.tsx`,
   `components/travel-options.tsx`.
4. `lib/engine/index.ts` and `lib/engine/retrieve/facets.ts` for the live facet
   counts and price bands.
5. `docs/05-design/ACCESSIBILITY.md:11`, a text and list alternative for every map
   result. That is not optional.

## ALLOWED — you own these, exclusively

```
app/explore/**
components/map.tsx
components/discovery-search.tsx
components/travel-options.tsx
components/ananta/explore/**
UI-UX-Fix-Prompts/BLOCKERS/4.md
```

## FORBIDDEN

```
tailwind.config.ts, app/globals.css, components/ananta/tokens.ts, records.ts, lib/ui-guard/**   session 1
components/ananta/pipeline.ts, use-ananta.ts                                                   session 2
app/layout.tsx, app/page.tsx, app/contact/**, components/footer.tsx, components/ui.tsx         session 3
app/trips/**, components/ananta/feasibility-meter.tsx                                          session 5
app/experience/**, provenance-badge.tsx, experience-media.tsx, report-button.tsx                 session 6
components/ananta/why-this.tsx, why-this-live.tsx, why-not-that.tsx, learning.ts,
  plan-button.tsx, plan-badge.tsx, save-button.tsx, share-button.tsx                              session 7
components/ananta/stress-radar.tsx, learned-weights.tsx, app/profile/**, app/saved/**            session 8
components/ananta/replan.ts, replan-proposal.tsx, app/events/**, availability-picker.tsx        session 9
app/provider/**, app/admin/**, app/terms/**, app/privacy/**                                    session 10
lib/**   FROZEN
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, vitest.config.ts, docs/**
```

**Your new components go in `components/ananta/explore/`.** That directory is yours
alone. Do not create a flat file in `components/ananta/`, that is how
`CONFIDENCE_TONE` got defined twice.

## Task

### 1. `components/discovery-search.tsx` — fix the dead primary CTA

`components/discovery-search.tsx:33` "See what is nearby" is the landing page's hero
action and it has **no `onClick`, no `href`, no `type`**. A judge clicks the primary
button and nothing happens. Session 3 is building the landing around a real
`Link href="/explore"`, so your job is narrower and specific:

- Make the chip strip a real control that navigates with the query, as a real
  `<Link>` or a form with a `type="submit"`. Not a `<div>` with a click handler.
- Remove the em dash at `:33`. `docs/05-design/DESIGN-CONTRACT.md:28` bans it in
  product copy and this file violates that.
- The chips are described as "every chip is a real query, not placeholder text".
  **Verify that is true.** If any chip is filler, delete it, because that sentence
  then becomes a false claim and `SESSION/UI-UX-DESIGN.md` section 9 lists
  unsupported copy under "do not".
- Each chip needs a real accessible name. A row of coloured pills with no text
  labels is a `ACCESSIBILITY.md:6` failure.

### 2. `app/explore/page.tsx` — the pipeline, in the right order, and visible

**The order is currently inverted.** At `:94-97`:

```ts
result = recommendExperiences(...)                    // gate and score, fused
quick  = applyQuickFilters(result.ranked.map(...))    // a SECOND gate
visibleRanked = result.ranked.filter(keptIds)
```

Excluded records get scored, sorted, and their score discarded. The order must be
retrieve, then gate, then score, then pack, then validate, then relax, and every
stage reads from `@/lib/engine` only. **RULE 0: you may not reimplement any of
them.** `lib/recommendation.ts` and `lib/quick-filters.ts` are not yours and become
dead code; leave them for the cleanup round and note it in your summary.

Then the two lines of copy that make the engine legible:

- **"120 of 1,107 considered"** under the results heading, from the retrieval
  result's real `totalConsidered`. One line. It makes stage 1 visible and it is the
  cheapest credibility in the product. Take both numbers from the engine and from
  `records.ts`. **Never hard-code them.**
- **The ranking tiebreak is wrong.** `:127` claims "With no filters, nearest places
  rank first", and with zero constraints the score collapses to `proximityBonus`
  bucketed at 3, 2, 1, **0**, so everything beyond 10 km scores exactly 0 and is
  then ordered **alphabetically**. Either fix the tiebreak in the engine, which is
  not yours, so: **fix the sentence**, and if the engine exposes a distance field on
  the row, sort the zero-bucket by it in your own view layer. Say which you did.

### 3. Every result card, in this priority order

1. **Name and area.** One line. Nothing above this.
2. **The binding facts.** Duration, travel, price, open or not. Real numbers from
   the record. **No adjectives.**
3. **Why this**, collapsed to the top two ranked components, expandable to all.
   Session 7 owns the component; you place it.
4. **The provenance strip.** The mixed chip, plus a micro-label adjacent to any
   `estimate` field's number. **Not in a footer.** The point is that a reader sees
   "estimated" next to the price, not three scrolls down.
5. **Add to plan.**

**The add-to-plan control is inconsistent.** `app/explore/page.tsx:240` is add-only,
so the label flips to "Added to plan" and re-clicking rewrites the same array, while
`components/plan-button.tsx:15` is a real toggle. Session 7 owns `plan-button.tsx`.
Use it, do not reimplement it, and if it is not a clean toggle yet, write a blocker
naming session 7 rather than building a second one.

### 4. The `UiState` coverage

Contracts section 2, all nine that apply to you:

- `solving` must show the **stage**, not a spinner. "Gate: 1107 to 23", then
  "Packing". Stage visibility is the demo. Keep it under 400ms or it is instant.
- `nothing-fits` leads with the cheapest relaxation and the count it unlocks, from
  `cheapestRelaxation`. **Never "No results".**
- `nothing-retrieved` names the filter that emptied the set and the one control
  that widens it. "Nothing within a 25 min walk. Widen to 40 min to see 12 more."
- `partially-unknown` renders advisory chips visually subordinate to blocking ones.
- `routing-down` and `offline` for the directions panel.

**The `ExcludedList` at `:238` renders every exclusion with no cap.** With a loose
filter set that is about a thousand divs. Cap it, show "and N more", and link
through to the per-record version session 7 builds. The bulk list and the
single-record panel are the same data at two scales; neither should be unbounded.

### 5. `components/map.tsx` — three real defects

**The map explodes at zoom 14.** `:127` passes all ~1107 records.
`lib/cluster.ts:12-17` returns `undefined` cell size at **zoom >= 14**, which
disables clustering entirely and yields every point, one DOM
`maplibregl.Marker` each with a click listener and a Popup. `map.tsx:92` calls
`flyTo({ zoom: 13 })`, one step away. Cap the marker count in your caller, because
`lib/cluster.ts` is not yours. A 300 cap with a "showing 300 of 1107" line is
honest and fast.

**`Popup.setHTML()` is an unescaped HTML sink.** `:59` and `:83` interpolate the
venue name, area and price straight into `innerHTML`. Not exploitable today because
the names are literals, but `.github/workflows/refresh-geocode.yml` rewrites that
data from Overpass every month, so one future name containing `<` breaks it. Use
`setDOMContent` with real nodes, or `setText` where it escapes for you. **A CSP is
coming and this will fail without this fix.**

**The map is a keyboard trap of dead space.** `:158` puts an `aria-label` on a
non-interactive div and individual markers at `:85` are MapLibre-created divs with
no role, no tabindex and no label. `ACCESSIBILITY.md:3` requires full keyboard
navigation. Cluster badges at `:71-76` are already real buttons and `.place-pin` in
`globals.css:66-76` is already a real button, keep that. Either make individual
markers focusable with a label, or state in the UI that the list is the accessible
path. `ACCESSIBILITY.md:11` requires the list alternative either way, and the
results grid already provides it. Do not leave the map implied rather than stated.

### 6. `components/travel-options.tsx` — the self-contradicting sentence

`:47` reads **"Live estimates from Marine Drive promenade, from OpenStreetMap
routing. Not live traffic."** That contradicts itself inside one sentence, and it
fires even when `route.kind === "estimate"`, at which point `:60` correctly says
"Straight-line estimate; routing unavailable." Make the leading word follow
`route.kind`. Two variants, no third.

`components/map.tsx:56` marks the demo pin `role="img"` with
`aria-label="Fixed demo location: ..."`. That is correct and ratified. Keep it.

## Constraints

- **Zero new dependencies.**
- **RULE 0: no engine in the view layer.** Import `retrieve`, `buildIndex`,
  `CATALOGUE_INDEX`, `gate`, `objectiveFast` from `@/lib/engine`. If something is
  missing, blocker.
- Keep `PAGE_SIZE = 24` at `:19` and the show-more control. The list never mounts
  more than 24 cards and that discipline is why the page does not jank.
- Keep the map scroll-away behaviour on mobile and the `hide-mobile` utility.
- No em dash, no emoji. No hard-coded dataset number.
- If session 1's `tokens.ts` is not there yet, import it and accept the typecheck
  error. Do not create it.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib/ui-guard
npm run dev
```

Then look at it. Specifically: filter to nothing and confirm `nothing-fits` shows
the cheapest relaxation, not "No results". Zoom the map to 15 and confirm it does not
freeze. Tab through the results and confirm a ring at every stop. Open a card and
confirm the `estimate` label sits next to the price it qualifies.

## Definition of done

1. The pipeline runs retrieve, gate, score, pack, validate, relax, in that order,
   reading only from `@/lib/engine`.
2. "N of M considered" renders from real data, and no dataset number is hard-coded.
3. The false nearest-first claim is either fixed or removed. You say which.
4. Every result card carries facts, why-this, an adjacent provenance strip, and one
   add-to-plan control, in that order.
5. The exclusion list is capped with an "and N more" affordance.
6. Zoom 15 on the map does not freeze, and the cap is disclosed rather than silent.
7. `setHTML` is gone. No unescaped HTML over machine-rewritten data.
8. The map's accessibility path is stated, not implied.
9. `travel-options.tsx` says "Live" only when the route is live.
10. All nine `UiState` values that apply render something deliberate.
11. `git status --short` shows only your five path patterns.
