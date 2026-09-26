# SESSION 3 of 10 — Landing, Global Chrome, and the First Five Seconds

> Copy everything below this line into a new session.

---

You are session 3 of 10 in the **UI/UX fix round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You own the first five seconds and the frame around every other screen. A judge
decides in five minutes, and this session is most of that five minutes.

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**. RULE 0, RULE 3, the
   house-style rules in section 3, and your row in section 6.
2. `SESSION/UI-UX-DESIGN.md` section 6.1, the landing specification.
3. `app/layout.tsx` (578 bytes), `app/page.tsx` (7682 bytes),
   `components/footer.tsx`, `components/ui.tsx` (21 lines, 3 exports),
   `app/contact/page.tsx`.
4. `components/ananta/records.ts` and, once session 1 lands, its `credibilityLine()`.
5. `docs/05-design/DESIGN-CONTRACT.md` lines 13 to 56, the never-use list and the
   content rules.

## ALLOWED — you own these, exclusively

```
app/layout.tsx
app/page.tsx
app/contact/**
components/footer.tsx
components/ui.tsx
UI-UX-Fix-Prompts/BLOCKERS/3.md
```

## FORBIDDEN

```
tailwind.config.ts, app/globals.css, components/ananta/tokens.ts, records.ts, lib/ui-guard/**   session 1
components/ananta/pipeline.ts, use-ananta.ts                                                   session 2
app/explore/**, components/map.tsx, discovery-search.tsx, travel-options.tsx                     session 4
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

## The two sentences that decide this session

**RULE 3:** "We don't know" is a first-class visual state, not an error state.

**House style:** every claim points at a field or a function. If you cannot name
the source of a sentence, delete the sentence.

## Task

### 1. `app/layout.tsx` — metadata and the skip link

**The meta description currently lies.** `app/layout.tsx:6` reads *"Find **verified**
local experiences, places, and events"*. About 96% of the catalogue is generated,
with hash-derived prices and durations, and the dataset's own `confidence` string
says "visit facts are demo estimates". This is the first thing any crawler and the
first thing any judge reads. Rewrite it truthfully.

Also:
- Keep the working skip link at `:14` with its `:focus` reveal. It is ratified.
- Add `openGraph` and `twitter` metadata. `SESSION/00-CONTRACTS.md` flagged that
  only `title`, `description` and `icons` exist, and that social preview is
  specified but never implemented. No `openGraph.images` unless one exists on disk;
  omit the key rather than point at a file that is not there.
- Keep `lang="en"`. Keep `id="main-content"` on `<main>`.
- The layout must not import from `components/ananta/` beyond what already resolves.
  Eight sessions are landing files right now.

### 2. `app/page.tsx` — the landing, rebuilt to `SESSION/UI-UX-DESIGN.md` 6.1

One `text-display` claim. One primary action. One credibility line. No hero image
pretending to be a place, because the images are 70 area photos shared across 1107
records and `docs/05-design/DESIGN-CONTRACT.md:25` bans stock-like imagery presented
as a real place.

The credibility line is the argument of the whole product, so it must be rendered
from data, not typed:

```tsx
import { credibilityLine } from "@/components/ananta/records";
```

If session 1 has not landed it, that is fine. Import it, accept the typecheck error,
and continue. **Do not write the numbers yourself and do not hard-code 1107, 391 or
43.** `docs/05-design/DESIGN-CONTRACT.md:17-19` bans fake metrics, and
`lib/ui-guard/hardcoded-numbers.test.ts` will fail your build if you do.

**The primary CTA is currently dead.** `components/discovery-search.tsx:33` "See
what is nearby" is the hero action and has no `onClick`, no `href`, no `type`. It is
not yours, session 4 owns it. Build the landing so it does not depend on that
component: use a real `<Link href="/explore">` for the primary action, and leave the
chip strip to session 4. Say in your summary that session 4 must not reintroduce a
dead control.

Also on this screen:
- An honest statement of what the product does not do. No sign-up, no booking, no
  live availability claims, no payments. `docs/05-design/DESIGN-CONTRACT.md:18`
  bans fake counters, and listing what is absent is more convincing than listing
  what is present.
- Exactly one `text-display` element. If a second one asks for it, one of them
  becomes a `text-title`.
- A visible route into `/explore` and nothing else competing for the click.

### 3. `components/ui.tsx` — the primitives, done properly

21 lines, 3 exports: `ButtonLink` (which is **dead code**, zero usages),
`StatusLabel`, `SectionHeading`, `BottomNav`.

This is the closest thing the project has to a design system, and the honest answer
is that the app looks consistent because the copy is disciplined, not because there
is one. **Do not build a component library.** But do fix the three real gaps:

- **Delete `ButtonLink` if it is still unused.** It is dead weight and session 1's
  guard will not catch it.
- **Add `Button`** as the one primary, secondary and ghost control, so the eleven
  near-identical Tailwind input strings across the app have somewhere to converge.
  Variants: `primary` filled blue, `secondary` white with a `line` border, `ghost`
  transparent. Rectangular with a modest radius, per
  `docs/05-design/DESIGN-CONTRACT.md:35`. **Not a pill.**
  `DESIGN-CONTRACT.md:16` bans pill-shaped buttons as the default style.
- **Add `Field`** for label plus input plus hint plus error, with the
  `htmlFor` pairing and the `aria-describedby` wiring done once instead of five
  times. `app/provider/page.tsx:96`, `app/trips/page.tsx:64-72` and
  `components/report-button.tsx:34` each have their own copy right now.
- Add `VisuallyHidden` wrapping the ratified `.sr-only` class rather than
  re-declaring it.
- Keep `StatusLabel` exactly as it is. 22 usages, and its three tones each carry
  text, which is what `ACCESSIBILITY.md:8` requires. Do not make it colour-only.
- Keep `BottomNav` and its `PlanBadge` slot, and make sure the mobile spacer still
  prevents overlap.

### 4. `components/footer.tsx` and `app/contact/**`

The footer exists and must keep four links: Privacy, Terms, Contact, and the route
into Provider and Operations. It is what makes the legal pages reachable on mobile,
which `SESSION/00-CONTRACTS.md` section 3 identifies as the primary demo viewport
because there is no other navigation to them at that width.

`app/contact/page.tsx` already exists. It was created against a spec that said the
footer should carry a "Report incorrect information" action. Make sure the report
path is reachable from here, and that the page states plainly what a report does
and who reads it. `lib/reports.ts` backs it.

### 5. The `UiState` coverage for your screens

Contracts section 2 defines nine states. Your landing, contact page and 404 path
must handle the ones that apply: `broken` is the only one that may look like a
failure, and even then it names what failed **and what still works**. No stack
trace, no shrug.

## Constraints

- **Zero new dependencies.** No component library, no icon set beyond
  `@phosphor-icons/react`, which is already installed. `DESIGN-CONTRACT.md:36`
  requires a consistent icon library and that is the one.
- No em dash (U+2014), no emoji (`DESIGN-CONTRACT.md:20, 28`).
- No hard-coded dataset number. Import from records.
- Do not edit a file you do not own. Nine people are in this tree.
- If the engine lacks something, blocker, not a local copy.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib/ui-guard
npm run dev
```

Then actually look at it. `npm run build` passing is not a landing page working.
Check at 1440px and 390px: one display element, no horizontal overflow, the primary
action navigates, the credibility line renders real numbers, the footer links all
resolve.

## Definition of done

1. The meta description makes no claim the data cannot support. No "verified".
2. `openGraph` and `twitter` metadata present, with no reference to a file that does
   not exist.
3. The landing has exactly one `text-display`, one primary action that navigates, and
   a credibility line rendered from `credibilityLine()`.
4. No dead control on the landing. The primary action is a real `Link`.
5. `ButtonLink` deleted if unused. `Button` and `Field` added and used by your own
   screens at least once each, so they are proven.
6. `StatusLabel` behaviour unchanged, 22 usages still compiling.
7. The footer carries Privacy, Terms, Contact, and the provider and operations
   links, and all four resolve on a 390px viewport.
8. No hard-coded dataset number anywhere in your files.
9. `git status --short` shows only your six path patterns.
10. Your summary names every sentence you deleted and why. On this project the
    deletions are the work.
