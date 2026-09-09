# Iterative Browser QA Loop

This is the default development process for Local Tourist. A feature is not considered ready because the code compiles. It must be rendered, browsed, interacted with, and checked against the product rules.

## Required Loop

```text
Choose one vertical slice
→ Make a small change
→ Run typecheck/build
→ Start or reload the local server
→ Browse affected routes
→ Test the user flow
→ Inspect console and network errors
→ Check mobile and desktop layouts
→ Compare against acceptance criteria
→ Fix findings
→ Re-run build and browser checks
→ Record the result
```

Do not stack multiple unverified UI changes before browsing the result.

## Required Viewports

Check at minimum:

```text
390 × 844   Mobile
768 × 1024  Tablet
1440 × 900  Desktop
```

The mobile check must include the fixed bottom navigation, map/list behavior, forms, dialogs, and horizontal overflow. The desktop check must include map height, side panels, cards, timelines, and legal-page width.

## Route Smoke Check

At minimum, browse:

```text
/
/explore
/events
/experience/kala-ghoda-art-walk
/trips
/saved
/provider
/admin/operations
/privacy
/terms
```

Every route must return a successful response and render without a server error.

## Core Interaction Flows

### Discovery

1. Open Home.
2. Open Explore.
3. Search by place or area.
4. Select a map marker.
5. Select a result from the list.
6. Open experience details.

### Plan

1. Add an experience to the plan.
2. Add a second experience.
3. Open Trips.
4. Change budget and available time.
5. Add a return deadline.
6. Verify feasibility and warnings.
7. Open the plan timeline.

### Adapt

1. Select a weather-dependent experience.
2. Request an alternative.
3. Inspect the suggested replacement.
4. Confirm the change.
5. Verify the plan updates only after confirmation.

### Trust Loop

1. Report incorrect experience or event information.
2. Open Operations.
3. Confirm the report appears in the queue.
4. Verify or mark the record stale.
5. Refresh and confirm persistence.

### Provider Loop

1. Open Provider.
2. Submit a listing with a source URL.
3. Confirm the listing is marked `Under review`.
4. Open Operations.
5. Confirm the provider submission appears.
6. Change provider availability.
7. Refresh and confirm persistence.

### Saved Loop

1. Save an experience from its detail page.
2. Open Saved.
3. Confirm the record appears.
4. Refresh the browser.
5. Remove the record.
6. Confirm the empty state.

## Browser Inspection

For each loop, check:

- Console errors and unhandled exceptions
- Failed network requests
- Missing map tiles or style failures
- Broken external media states
- Incorrect focus behavior
- Keyboard access
- Dialog close behavior
- Form validation
- Loading and empty states
- Stale or demo data labels
- No fabricated claims

Use the approved Playwright CLI or Playwright MCP from `/home/abhijitk20/plugins`. The current environment has the Playwright plugin dependencies but does not have a Chromium or Chrome executable installed. Until that is resolved, record HTTP/build checks separately and do not describe them as visual browser QA. Install/configure Chromium before treating screenshot, viewport, console, or interaction checks as complete. HTTP status checks alone are not browser QA.

## Design Contract Check

Every visual pass must confirm:

- No purple gradients
- No pill-shaped default buttons
- No emoji icons
- No cursor animation
- No excessive scroll animation
- No fake metrics or reviews
- No AI slop imagery or copy
- No vague claims
- No em dashes in product copy
- Real or clearly labeled media only
- Practical data visible before decorative content

## Change Record

After each verified slice, record:

- Date
- Routes checked
- Viewports checked
- User flow checked
- Build/test command
- Findings
- Fixes made
- Remaining limitation

Use `docs/02-planning/DECISION-LOG.md` for architectural decisions and the task/session summary for short implementation results.

## Release Rule

Never call a feature Done from compilation alone. It is Done only when the feature's acceptance criteria pass, the browser flow works, the responsive layouts hold, errors are handled, and known limitations are documented.

## Current QA Baseline

The local Chromium binary is now installed through the approved Playwright setup. Stable isolated browser checks have passed at mobile and desktop sizes for the current route set, with no console errors on the isolated route checks.

The save and draft-plan interaction has also passed in Chromium:

```text
Experience detail → Save → Saved route
Experience detail → Add to plan → Trips route
```

The deterministic discovery and recommendation flow has passed at mobile and desktop widths:

```text
Natural-language request → Extracted constraints → Ranked matches
Ranked match → Matching reasons
Excluded record → Concrete exclusion reasons
```

The recommendation engine has unit coverage for city/category/budget filtering, travel-plus-buffer time constraints, rainy-day exclusion, and direct locality search.

The provider availability loop has passed in mobile Chromium:

```text
Provider marks experience closed
→ Explore removes it from eligible results
→ Exclusion panel explains the provider closure
```

This pass identified and fixed a shared mobile issue where the fixed bottom navigation could cover and intercept controls near the page end. `BottomNav` now reserves mobile layout space before the fixed bar.

Plan comparison has passed in mobile Chromium:

```text
Draft with two places
→ Compare feasible plans
→ Review listed cost and time differences
→ Apply a variant explicitly
→ Draft updates after confirmation
```

Plan calculations and variant generation have unit coverage for duration parsing, travel-plus-buffer totals, hard feasibility, and duplicate-variant removal.

The event lifecycle has passed in mobile Chromium:

```text
Happening Near Me
→ Reference-time selection
→ Reachable events listed with status and reason
→ Excluded events explain expiry or unreachable timing
```

Event scheduling has unit coverage for live windows, expired windows, unreachable start times, and reachable start times. A reason-string bug was found and fixed during this pass: remaining gap is now computed from the reference time rather than the absolute start time.

Map clustering and geographic zones have passed in mobile and desktop Chromium:

```text
Explore
→ Select zone
→ Clustered GeoJSON markers update
→ Matching list updates
→ No horizontal overflow
```

The map now uses a clustered GeoJSON source with cluster count layers and cluster expansion zoom. Zone metadata is preserved on each experience record.

For longer multi-route interaction runs, use a persistent server process. A background server tied to a short-lived shell command can be terminated when the shell exits, which is an environment issue rather than an application result.

## Sprint 4 QA Record (2026-09-09)

**Routes checked:** `/events`, `/experience/kala-ghoda-art-walk`, `/experience/vashi-market-loop`, `/experience/kharghar-hills-view`, `/provider`, `/trips`, `/admin/operations`.

**Viewports:** 390×844 mobile and 1440×900 desktop in Chromium (installed Playwright runtime, headless).

**Build/test commands:** `npx tsc --noEmit` (pass), `npm test` (5 files, 28 tests, pass), `npm run build` (12 routes generated), HTTP smoke on all routes (200), scripted Chromium run with console/page-error capture.

**Flows and findings (18 automated browser checks, all passed, zero console errors, no horizontal overflow):**

- US-023 approved media: experience detail renders approved YouTube cards with static thumbnail and platform attribution (no autoplay); Instagram records fall back to an `Open on Instagram` external link; archived media is excluded so only the honest empty state remains.
- US-033 event change detection: changed events render an amber banner with field-level before/after values (venue, start time, price); reference-time filtering still works; each change enters the admin operations queue as `Change detection` records; reference-time selection regression-checked.
- US-018 unavailable-activity adaptation: provider marks a planned experience closed → trips page flags the plan as needing attention → a replacement is suggested only after it passes the hard constraints (time, budget, deadline) through `evaluatePlan` → the plan updates only after explicit confirmation → the warning clears after apply. When no candidate keeps the plan feasible, the panel says so and offers removal instead of inventing a replacement.

**Fixes made during this pass:** event `startMinutes` are reference-relative, so change labels describe minutes from the reference time rather than fabricated clock times.

**Remaining limitation:** media thumbnails are static per the media policy; embed playback happens on the platform after the user clicks. Unit coverage exists for media resolution (`lib/media.test.ts`), change detection (`lib/events.test.ts`), and replacement suggestions (`lib/adapt.test.ts`).

## Sprint 1, 5, and 6 Completion Record (2026-09-09)

**Scope closed:** Sprint 1 dataset and map gaps, the remaining Sprint 5 stories (US-024, US-032, US-035, US-037), and Sprint 6 polish and release hardening.

**Routes checked:** `/`, `/explore`, `/events`, `/experience/marine-drive-sunset-walk`, `/experience/kharghar-hills-view`, `/experience/kala-ghoda-art-walk`, `/experience/vashi-market-loop`, `/trips`, `/saved`, `/provider`, `/admin/operations`, `/privacy`, `/terms`.

**Viewports:** 390×844 mobile, 768×1024 tablet, 1440×900 desktop in Chromium (installed Playwright runtime, headless, `--disable-dev-shm-usage` for the container).

**Build/test commands:** `npx tsc --noEmit` (pass), `npm test` (10 files, 48 tests, pass), `npm run build` (12 routes generated), HTTP smoke on all routes (200), scripted Chromium runs with console/page-error capture.

**Findings and fixes made during this pass:**

- Admin media actions initially did not persist because the action helper was made pure without updating the caller to write the store. Fixed in `app/admin/operations/page.tsx`.
- Experience detail pages lacked the source-and-freshness block required by US-004. Added source link, confidence, and last-checked display.
- A demo media record used an unresolvable YouTube id, which produced a 404 thumbnail request after admin approval. Replaced with a resolvable demo placeholder and an explicit provenance note.
- Cluster cell sizes were tuned to the metro scale (0.1 degree at city zoom) after the first pass produced a single merged blob across 31 records.
- Two QA script defects were found and fixed before drawing conclusions: a storage-clearing init script ran on every navigation and wiped state mid-loop, and cluster badge clicks targeted markers outside the mobile viewport.

**Flows verified (29 automated browser checks, all passed, zero console errors, no horizontal overflow at any viewport):**

- Sprint 1: cluster badges render at city zoom (9 clusters across 31 records), expand on click, zone filter shows only in-zone records with others excluded, confidence label and source link render on detail pages.
- Sprint 5: provider signals panel renders and cites its demo signals; admin can approve and reject external media and the traveler-facing detail page follows the store; decisions persist across refresh; hidden-gem queue renders candidates with safety flags and verification history; media reports route to the media review kind.
- Sprint 6: report dialog opens with dialog semantics, closes on Escape, skip link and main landmark present; all overflow checks pass at mobile, tablet, and desktop.
- Adaptation regression: provider closure on a planned place still produces a constraint-checked, confirm-before-apply replacement with the expanded dataset.

**Definition of Done check for the sprint:** acceptance criteria pass for closed stories; loading, empty, and error states exist (media empty state, map tile fallback, no-results states); responsive behavior checked at three viewports; accessibility basics checked (skip link, dialog behavior, labels); unit tests exist for every new pure module; external failure fallback exists for map tiles; provenance and freshness preserved on all new records; no secrets committed; user-facing copy contains no fabricated claim, emoji icon, or em dash; demo path documented in `docs/06-quality/DEMO-SCRIPT.md` and works without paid services.

**Remaining limitations:** the dataset is 31 curated demo records against the 150 to 300 target; hidden-gem and alert signals remain demo-device-local; playback still happens on the platform after an explicit click.
