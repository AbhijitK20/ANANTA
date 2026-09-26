# SESSION 4 of 10 — Explore: Depth as a Filtering Device

> Copy everything below this line into a new session.

---

You are session 4 of 10 in the **spatial UI round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You own the screen where a traveller decides whether to trust the engine. On this
screen the spatial design does its most useful work, because **depth filters before
the eye reads a single word.**

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**. Section 6 encodings 1, 2
   and 6 are yours. Section 7 is the map.
2. `SESSION/UI-UX-DESIGN.md` sections 5, 6.2 and 7.
3. `app/explore/page.tsx` (26KB, the largest page in the repo),
   `components/map.tsx` (8KB), `components/discovery-search.tsx`,
   `components/travel-options.tsx`.
4. `lib/engine/index.ts` and `lib/engine/retrieve/facets.ts` for live counts.
5. `docs/05-design/ACCESSIBILITY.md:11`, a text and list alternative for every map
   result. Not optional.

## The one idea that makes this screen work

> **Uncertainty is recession. Rejection is recession. What stands up is what you can
> actually go to.**

A result grid rendered in depth teaches its grammar in about four seconds, and then
a traveller reads confidence without reading anything. A card standing proud is
verified. A card flush on the surface is our arithmetic. A card carved into the
surface is something we do not know. A card pushed back and desaturated is one the
gate rejected, and the reason is right there when they tap it.

**That is the entire thesis of ANANTA rendered in space, and you are the screen
where it pays off.** It is also why the design is not decoration: without the
spatial layer this page needs a chip, a footnote and a legend to convey the same
three facts.

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
tailwind.config.ts, app/globals.css, tokens.ts, records.ts, lib/ui-guard/**     session 1
components/ananta/pipeline.ts, use-ananta.ts                                    session 2
app/layout.tsx, app/page.tsx, app/contact/**, footer.tsx, ui.tsx                 session 3
app/trips/**, components/ananta/feasibility-meter.tsx                           session 5
app/experience/**, provenance-badge.tsx, experience-media.tsx, report-button.tsx           session 6
components/ananta/why-this.tsx, why-this-live.tsx, why-not-that.tsx, learning.ts,
  plan-button.tsx, plan-badge.tsx, save-button.tsx, share-button.tsx             session 7
components/ananta/stress-radar.tsx, learned-weights.tsx, app/profile/**, app/saved/**     session 8
components/ananta/replan.ts, replan-proposal.tsx, app/events/**, availability-picker.tsx   session 9
app/provider/**, app/admin/**, app/terms/**, app/privacy/**                     session 10
lib/**   FROZEN
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, vitest.config.ts, docs/**
```

New components go in `components/ananta/explore/`. One directory, yours alone.

## Task

### 1. The order is inverted and depth makes it visible

`app/explore/page.tsx:94-97`:

```ts
result = recommendExperiences(...)                    // gate and score, fused
quick  = applyQuickFilters(result.ranked.map(...))    // a SECOND gate
visibleRanked = result.ranked.filter(keptIds)
```

Excluded records get scored, sorted, and their score discarded. The order must be
retrieve, gate, score, pack, validate, relax, all reading from `@/lib/engine`.
**RULE 0: you may not reimplement any of them.** `lib/recommendation.ts` and
`lib/quick-filters.ts` are not yours and become dead code; note that in your summary.

### 2. Depth on every result card

Use `depthForRecord(record, rejections)` from `pipeline.ts`, which session 2 is
rewriting to expose. It returns a class name, counts verified fields, and sets
`mixed` where a record is partly known.

| Card state | Class | And |
|---|---|---|
| verified or community | `depth-raised` | solid chip |
| estimate | `depth-flush` | **outlined** amber chip, on the surface |
| unverified | `depth-recessed` | dashed, 60% saturation, inset shadow |
| mixed | `depth-flush` | split chip. **Never collapses to verified** |
| rejected by the gate | `depth-recessed` | dashed edge, 60% saturation, reason on tap |
| top-ranked result | `depth-lifted` | one only. Never more than one card lifted |
| hover | one step up, `rotateX` at most 3 degrees | |

**A `mixed` record must render `mixed`.** Roughly 96% of the catalogue is generated
with hash-derived prices, so this is the common case, not the exception, and
collapsing it to `verified` would launder the entire dataset through a spatial
channel. A grid where most cards stand proud and a few are carved into the surface
is also a much more honest picture than a uniform grid.

When the rejection panel opens, it **rises out of** the recessed card:
`depth-flush` while open, `depth-recessed` when closed. Session 7 owns the panel
component; you place it and own the transition.

Card content order is unchanged and still matters more than the depth: name and
area, then the binding facts with real numbers, then why-this collapsed to two
components, then the provenance strip with the `estimate` label **adjacent to the
number it qualifies** rather than in a footer, then add-to-plan.

### 3. Two lines of copy that make the engine legible

- **"120 of 1,107 considered"** under the results heading, from the real
  `totalConsidered`. It makes stage 1 visible and it is the cheapest credibility in
  the product. Both numbers from the engine and from `records.ts`. **Never
  hard-coded.**
- **The nearest-first claim is false.** `:127` says "With no filters, nearest places
  rank first", and with zero constraints the score collapses to `proximityBonus`
  bucketed at 3, 2, 1, **0**, so everything past 10 km scores exactly 0 and is then
  ordered **alphabetically**. The engine is not yours, so **fix the sentence**, and
  if the row exposes a distance, sort the zero bucket by it in your own view layer.
  Say which you did.

### 4. `components/map.tsx` — depth on a 2D map, carefully

The map stays 2D. A tilted basemap is a navigation hazard and MapLibre owns its
render loop. Depth here is **pin state only**, from contracts section 7:

- **Selected pin** lifts to `depth-floating`, with a shadow that grows with the
  lift. The map is inside a 3D container so the lift reads, but **the basemap
  layers must not be inside it**, or MapLibre's canvas gets transformed and the
  controls drift out of alignment.
- **Cluster badges** get the five-layer stack at `depth-raised`. A cluster already
  means "a group at one place", so elevation reinforces a meaning that exists rather
  than inventing one.
- **A rejected record's pin is recessed and dashed.**
- **Rain desaturates the map, and `heavy_rain` and `storm` additionally blur it**,
  because that is what rain does to distance perception, and it makes the
  straight-line-estimate label feel necessary rather than pedantic.

**Three real defects to fix while you are in there.**

`map.tsx:127` passes all ~1107 records, and `lib/cluster.ts:12-17` returns
`undefined` cell size at **zoom >= 14**, which disables clustering entirely and
yields every point as a DOM `maplibregl.Marker`. `map.tsx:92` calls
`flyTo({ zoom: 13 })`, one step away. Cap it in your caller, since
`lib/cluster.ts` is not yours. **A cap must be disclosed, not silent:** "showing
300 of 1,107".

`map.tsx:59` and `:83` interpolate the venue name, area and price into
`Popup.setHTML()`, an unescaped `innerHTML` sink. Not exploitable today, but
`refresh-geocode.yml` rewrites that data from Overpass monthly, and a CSP is
coming. Use `setDOMContent` with real nodes.

`map.tsx:158` puts an `aria-label` on a non-interactive div, and individual markers
at `:85` are MapLibre divs with no role, tabindex or label. **A 3D pin that is not
focusable is worse than a flat one that is not**, because the lift invites
interaction. Make markers focusable with a label, or state in the UI that the list
is the accessible path. Cluster badges at `:71-76` are already real buttons and
`.place-pin` in `globals.css:66-76` is too. Keep that.

### 5. `components/discovery-search.tsx` — the dead CTA and two bans

`:33` "See what is nearby" is the landing's hero action with no `onClick`, no
`href`, no `type`. Session 3 is building the landing around a real `Link`, so your
job is the chip strip: make it a real `<Link>` or a `type="submit"` form, not a div
with a click handler. Remove the em dash at `:33`, which
`DESIGN-CONTRACT.md:28` bans. Verify the claim that "every chip is a real query" is
actually true, and delete any that are not, because then the sentence becomes false.

**The chip strip is `depth-flush`, and the primary chip is `depth-raised`.** A
raised chip is an available action; a flush one is context. Do not give chips hover
tilt, because a strip of tilting pills is noise.

### 6. `components/travel-options.tsx` — the self-contradicting sentence

`:47` reads **"Live estimates from Marine Drive promenade, from OpenStreetMap
routing. Not live traffic."** It contradicts itself in one sentence and fires even
when `route.kind === "estimate"`, where `:60` correctly says "Straight-line
estimate; routing unavailable." Make the leading word follow `route.kind`. Two
variants, no third.

### 7. States and the exclusion list

All nine `UiState` values that apply. `solving` shows the **stage**, not a spinner.
`nothing-fits` leads with the cheapest relaxation. `nothing-retrieved` names the
filter that emptied the set and the one control that widens it.

**The `ExcludedList` at `:238` renders every exclusion with no cap**, which is
about a thousand divs on a loose filter set. Cap it, show "and N more", and link
through to the per-record panel session 7 builds. **Rejected records render
`depth-recessed` here too**, so the bulk list and the single-record panel agree.

## Constraints

- **RULE 0: no engine in the view layer.** `retrieve`, `buildIndex`,
  `CATALOGUE_INDEX`, `gate`, `objectiveFast` and `depthForRecord` come from
  `@/lib/engine` and `@/components/ananta/pipeline`. If something is missing,
  blocker.
- **Class names only.** No `style={{ transform }}`, ever. It bypasses the
  reduced-motion block and session 1's test will fail the build.
- Keep `PAGE_SIZE = 24` at `:19` and the show-more control. That discipline is why
  the page does not jank, and it matters more now that cards have layered shadows.
- **No MapLibre canvas or control inside a 3D container.** Only pins and badges.
- Zero new dependencies. No motion library.
- No em dash, no emoji, no hard-coded dataset number.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib/ui-guard
npm run dev
```

Then:

1. Filter to nothing and confirm `nothing-fits` shows the cheapest relaxation, not
   "No results".
2. Zoom the map to 15 and confirm no freeze, and that the cap is disclosed.
3. **Emulate reduced motion and confirm the grid still reads correctly with no
   movement at all**, from colour, saturation and borders alone. This is the test
   that proves the depth was carrying meaning rather than decoration.
4. Open a curated record and a generated one side by side. **Their cards must sit at
   different depths**, because their data is different.
5. Tab the whole grid. A ring at every stop, and no focus ring clipped by a
   `translateZ`.
6. DevTools Performance on a card hover: main thread idle, frame time under 16 ms.

## Definition of done

1. The pipeline runs retrieve, gate, score, pack, validate, relax, reading only from
   the engine.
2. "N of M considered" renders from real data. No hard-coded number.
3. The false nearest-first claim is fixed or removed, and you say which.
4. Every card's depth comes from `depthForRecord` and matches its real knowledge
   state. **A `mixed` record never renders as verified.**
5. Exactly one card is `depth-lifted` at a time.
6. The exclusion list is capped with "and N more", and its items are recessed.
7. Zoom 15 does not freeze and the cap is disclosed.
8. `setHTML` is gone. The map's accessibility path is stated, not implied.
9. `travel-options.tsx` says "Live" only when the route is live.
10. Pin and cluster depth only. No MapLibre canvas inside a 3D container.
11. Reduced motion still readable by colour alone, and you verified it.
12. `git status --short` shows only your five path patterns.
