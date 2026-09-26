# UI/UX FIX — Frozen Contracts

> Ten UI/UX sessions, one working tree, zero overlap. This file is the coordination
> mechanism. Every token, state, class name and export other sessions need is
> written out here as compilable TypeScript and as literal Tailwind class strings.
>
> Engine contracts live in `../SESSION/00-CONTRACTS.md` and are unchanged. This file
> adds only what the visual layer needs.

---

## RULE 0 — No engine in the view layer

**You may not implement anything that already exists in `lib/engine/`.**

This is not a style rule. `components/ananta/pipeline.ts` currently contains its own
`tokenize`, `buildIndex`, `retrieve`, `gate`, `wilsonLowerBound`, `objectiveFast`,
`pack`, `objectiveNaive`, `validate` and `relax`. That fork put `objectiveFast` and
`objectiveNaive` in the same file, which means the project's 1e-6 independence
guarantee currently measures a function against its own neighbour, and it placed a
full engine copy outside the boundary that `lib/engine/guard/no-model.test.ts`
inspects.

Session 2's entire job is to delete that fork. **Nine of you will be tempted to
recreate it**, because session 1 in the previous round was, and it looked faster
than waiting.

| You want | Do this |
|---|---|
| A gate function | `import { gate } from "@/lib/engine"` |
| Score components | `import { objectiveFast, wilsonLowerBound } from "@/lib/engine"` |
| BM25 | `import { retrieve, buildIndex, CATALOGUE_INDEX } from "@/lib/engine"` |
| A travel-time lookup | `import { makeTravelOptions, buildStops } from "@/lib/engine"` |
| Something genuinely missing | **A blocker entry.** Not a local copy. |

Session 1 writes a test that fails the build if any function or constant name
exported by `lib/engine/index.ts` is also declared in `app/**` or
`components/**`. Your build will fail if you fork. That is deliberate.

---

## RULE 1 — One subdirectory per session

`components/ananta/` is currently a **flat** directory with 13 files, and that is
how `CONFIDENCE_TONE` ended up defined twice: in `provenance-badge.tsx` and again
in `why-not-that.tsx:16`. Two definitions of one visual language, guaranteed to
drift, and when they drift a rejection and a badge will disagree about what
"unverified" looks like.

**New components go in a subdirectory named for your session's feature.** One
directory, one owner, no exceptions.

```
components/ananta/tokens.ts        session 1   (the single shared file)
components/ananta/explore/         session 4
components/ananta/trips/           session 5
components/ananta/provenance/      session 6
components/ananta/why/             session 7
components/ananta/learning/        session 8
components/ananta/replan/          session 9
components/ananta/provider/        session 10
```

The 13 existing flat files are each reassigned to exactly one session in section 7.
You may edit your own. You may not edit anyone else's.

---

## RULE 2 — Import the shared tokens, never redefine them

Session 1 creates `components/ananta/tokens.ts` **in the first 20 minutes of its
run** with the exact contents specified in section 2.

Sessions 2 through 10: import from it.

```ts
import { CONFIDENCE_TONE, typeScale, STATE_COPY } from "@/components/ananta/tokens";
```

**If the file does not exist yet, define the import, accept the typecheck error,
and continue with everything else.** Do not create it. Do not create a local copy
of a tone map. Session 1 will land it within minutes, and two definitions is the
exact bug this rule exists to prevent.

---

## RULE 3 — The design thesis, and the one sentence that settles arguments

> **"We don't know" is a first-class visual state, not an error state.**

A screen that says *"Opening hours are unverified, so we will not claim it is
open"* has to look as **considered** as one that shows a recommendation. Not like a
bug, not like a warning, not greyed out apologetically. **Considered.**

Two jobs, in priority order:

1. Make a refusal look as deliberate as a recommendation.
2. Make a number's provenance readable in under a second.

When a design decision and that sentence disagree, the sentence wins. Full rationale
in `../SESSION/UI-UX-DESIGN.md`.

---

## 1. Ratified, do not redo

**Tokens in `tailwind.config.ts`**, satisfying `docs/05-design/DESIGN-CONTRACT.md:32-35`:

```
ink #18202B · muted #667085 · line #DDE3EA · canvas #F4F6F8
blue #175CD3 · blueSoft #E8F0FF · green #087443 · greenSoft #E8F5EE
amber #A15C07 · amberSoft #FFF4D6
shadow-card 0 12px 32px rgba(24,32,43,.07) · shadow-float 0 20px 55px rgba(24,32,43,.14)
```

**Already fixed and ratified:** the real `:focus-visible` ring at
`app/globals.css:152-167` with inversion on blue surfaces, `.sr-only` at `:168`,
keyboard-reachable `.place-pin` buttons at `:66-76`, the reduced-motion block at
`:128-131`, the skip link at `:133-143`.

**Six thesis components already built and working:** `feasibility-meter.tsx`
(activity, travel and buffer as three distinct segments with a full-sentence
`role="img"`), `why-this.tsx` (ranked by descending absolute contribution),
`why-not-that.tsx` (typed rejections, blocking and advisory separated, cheapest
relaxation), `provenance-badge.tsx` (per-field provenance with meaning text),
`learned-weights.tsx`, `stress-radar.tsx` (7 factors plus one rescue move),
`replan-proposal.tsx`.

Your job is to integrate, extend and fix them. Not to rewrite them from scratch.

**Preserve:** `PAGE_SIZE = 24` paging. No autoplaying media in cards
(`DESIGN-CONTRACT.md:82`). A list alternative for every map result
(`ACCESSIBILITY.md:11`).

---

## 2. `components/ananta/tokens.ts` — session 1 writes this, verbatim

Nine sessions import it. It is specified here in full so nobody has to guess a hex
value at 2am.

```ts
import type { Confidence, Provenance, ProvenancedField } from "@/lib/engine";

/* ── type scale ─────────────────────────────────────────────────────────── */
export const typeScale = {
  micro: "text-[11px] leading-4",
  meta: "text-xs leading-5",
  bodySm: "text-[13px] leading-5",
  body: "text-sm leading-6",
  lead: "text-[17px] leading-7",
  title: "text-xl leading-7 font-bold tracking-[-0.03em]",
  display: "text-[28px] leading-[34px] font-bold tracking-[-0.04em]",
} as const;

/* ── space, radius, motion, layer ────────────────────────────────────────── */
export const space = { xs: "p-1", sm: "p-2", md: "p-3", lg: "p-4", xl: "p-6", "2xl": "p-8" } as const;
export const radius = { chip: "rounded-sm", input: "rounded", card: "rounded-md", pill: "rounded-full" } as const;
export const motion = {
  hover: "transition-colors duration-100 ease-out",
  state: "transition-all duration-200 ease-out",
} as const;
export const layer = {
  base: "z-0", sticky: "z-10", dropdown: "z-20", popup: "z-30", sheet: "z-40", skip: "z-50",
} as const;

/* ── the six knowledge states ────────────────────────────────────────────── */
/* Filled chips assert a fact. OUTLINED chips assert our arithmetic.          */
/* DASHED is the shape for "we do not know", and it is never a warning red.   */
export const PROVENANCE_TONE: Record<Provenance, string> = {
  curated: "bg-greenSoft text-green border border-green",
  provider: "bg-blueSoft text-blue border border-blue",
  osm: "bg-greenSoft text-green border border-green",
  derived: "bg-blueSoft text-blue border border-blue",
  inferred: "bg-amberSoft text-amber border border-amber",
};

export const CONFIDENCE_TONE: Record<Confidence, string> = {
  verified: "bg-greenSoft text-green border border-green",
  community: "bg-blueSoft text-blue border border-blue",
  estimate: "bg-amberSoft text-amber border border-amber",
  unverified: "bg-canvas text-muted border border-dashed border-muted",
};

/** The split chip. A record that is partly verified NEVER collapses to verified. */
export const MIXED_TONE = "bg-canvas text-muted border border-line";
export const mixedChip = (verified: number, total: number) =>
  `${MIXED_TONE} ${verified} of ${total} fields verified`;

export const KNOWLEDGE_LEGEND: { state: Confidence; label: string; meaning: string }[] = [
  { state: "verified", label: "Verified", meaning: "Matched to a source we can name." },
  { state: "community", label: "Community", meaning: "Reported by a resident or a provider." },
  { state: "estimate", label: "Estimate", meaning: "A computed number. Our arithmetic, not a claim." },
  { state: "unverified", label: "Unverified", meaning: "We do not know this yet." },
];

/* ── the nine UI states ──────────────────────────────────────────────────── */
/* Every screen implements all nine. A state that renders a blank div is a bug. */
export type UiState =
  | "solving" | "nothing-fits" | "nothing-retrieved" | "partially-unknown"
  | "abstained" | "routing-down" | "offline" | "sold-out" | "broken";

export const UI_STATE_COPY: Record<UiState, { title: string; body: string; tone: "blue" | "muted" | "amber" }> = {
  solving: {
    title: "Working",
    body: "Stage updates below. Nothing is hidden while this runs.",
    tone: "blue",
  },
  "nothing-fits": {
    title: "Nothing fits all of it",
    body: "The cheapest single change is named first, with the count it would unlock.",
    tone: "muted",
  },
  "nothing-retrieved": {
    title: "Nothing in range",
    body: "Name the filter that emptied the set and the one control that widens it.",
    tone: "muted",
  },
  "partially-unknown": {
    title: "Some facts are unverified",
    body: "These are marked. They did not decide the result.",
    tone: "muted",
  },
  abstained: {
    title: "We will not claim this",
    body: "A fact is unknown, so the gate declined to judge. This is not a rejection.",
    tone: "muted",
  },
  "routing-down": {
    title: "Live routing is unavailable",
    body: "Showing a straight-line estimate at the city congestion multiplier.",
    tone: "amber",
  },
  offline: {
    title: "Running on the committed snapshot",
    body: "Everything below is real stored data. Live routing needs a connection.",
    tone: "blue",
  },
  "sold-out": {
    title: "Sold out",
    body: "State the fact and its timestamp, then offer the replan.",
    tone: "amber",
  },
  broken: {
    title: "Something failed",
    body: "One sentence naming what failed and what still works. No stack trace.",
    tone: "amber",
  },
};

/* ── field labels, verbatim ─────────────────────────────────────────────── */
export const FIELD_LABEL: Record<ProvenancedField, string> = {
  name: "Name", coordinates: "Coordinates", address: "Address", category: "Category",
  duration: "Duration", price: "Price", pricePerPerson: "Price per person",
  capacity: "Capacity", openingHours: "Opening hours", accessibility: "Accessibility",
  indoor: "Indoor or outdoor", kidFriendly: "Good with children", booking: "Booking",
  seasonality: "Season", bestTime: "Best time of day", diet: "Food served",
  rating: "Rating", reviewCount: "Review count", media: "Photos and video",
};

export const COMPONENT_LABEL: Record<string, string> = {
  interest: "Matches your interests", rating: "Rating, weighted by review count",
  value: "Value for money", authenticity: "Local authenticity", weather: "Weather fit",
  crowd: "Crowd at that hour", novelty: "Different from your other stops",
  groupFit: "Fits your group", travelFriction: "Travel to get there", reliability: "Provider reliability",
};

export const TONE_TEXT = { blue: "text-blue", green: "text-green", amber: "text-amber", muted: "text-muted" } as const;
```

**Session 1 writes this file exactly.** Sessions 2 to 10 import it. If you find
yourself typing a hex value, a tone map or a label string inline, stop and import
it instead.

---

## 3. House style, non-negotiable

- **No em dash (U+2014) and no emoji** in any string, comment or test name.
  `docs/05-design/DESIGN-CONTRACT.md:28` bans em dashes;
  `.opencode/skills/ananta-honesty` extends it to emoji and fabricated claims.
- **One `text-display` per screen.** If two elements want it, one is a section
  heading. The meter's headline at `feasibility-meter.tsx:54` is correctly the
  largest thing on its screen.
- **No line of text over about 70 characters.** Cap the shell at 1480px.
- **Never hard-code a dataset number.** Import `DATASET_SIZE`, `HAND_WRITTEN`,
  `OSM_MATCHED`, `CURATED_CATEGORY_COUNT` from `@/components/ananta/records`.
  `docs/05-design/DESIGN-CONTRACT.md:17-19` bans fake metrics.
- **Every claim points at a field or a function.** If you cannot name the source of
  a sentence, delete the sentence.
- **Zero new dependencies.** `components/ui.tsx` is small and the app looks
  consistent because the copy is disciplined, not because there is a design system.
  Do not introduce one.

---

## 4. Accessibility targets, measurable

`docs/05-design/ACCESSIBILITY.md` is 14 lines of intent. These are the numbers
behind it, so compliant stops being a matter of opinion.

| Requirement | Target | Status |
|---|---|---|
| Body contrast | 4.5:1 minimum | `ink` on `canvas` 13.9:1. `muted` on `white` 4.9:1. `amber` on `amberSoft` 4.6:1. All pass. |
| Focus visible | 3px ring on every interactive element | **done**, `globals.css:152` |
| Keyboard reach | all content reachable without a pointer | markers are real buttons. The map canvas is not keyboard navigable, so **document the list as the accessible path in the UI**, do not leave it implied |
| Chart alternative | the stress radar has a table equivalent | **not done. Session 8.** A 7-axis radar is unreadable to a screen reader and useless in print |
| Status not by colour alone | every tone carries text | `availability-picker.tsx:68`'s dot is `aria-hidden` with no text equivalent. **Session 9** |
| Dialog semantics | a real focus trap, or no `aria-modal` | **not done.** `report-button.tsx:34` claims `aria-modal` without trapping. **Session 6** |
| Motion | no animation required to understand content | **done**, `globals.css:128` |
| Live regions | solving and replan announce themselves | **not done. Session 5 and 9.** `aria-live="polite"` on the stage line |
| Zoom | 200% with no loss of content | no fixed heights on text containers |
| Touch target | 44 by 44 CSS px minimum on mobile | `ui.tsx:20` uses `min-w-[58px] px-3 py-3`, fine |

---

## 5. The demo path, in order

This is the judged sequence. Design and QA it end to end.

```
1  /                     one claim, one action, the credibility line
2  /explore              the workspace, 120 of 1,107 considered
3  /experience/[id]      the graded-facts table, one badge per row
4  /trips                the proof: meter, drift stamp, radar, plan
5  /provider             the unmet-demand feed
```

The highest-value unbuilt element is on `/trips`: a **validation stamp** reading
something like *"Objective re-derived independently. Drift 0.000000."* It is one
line of UI over data `validate.ts` already returns, and it is the single thing that
makes a judge trust the engine. Session 5 owns it.

---

## 6. Ownership map

Every file, one owner. Verify with `git status --short` before reporting done.

| Owner | Files |
|---|---|
| **1 Foundations** | `tailwind.config.ts` · `app/globals.css` · `components/ananta/tokens.ts` · `components/ananta/records.ts` · `lib/ui-guard/**` |
| **2 Fork removal** | `components/ananta/pipeline.ts` · `components/ananta/use-ananta.ts` |
| **3 Landing and chrome** | `app/layout.tsx` · `app/page.tsx` · `app/contact/**` · `components/footer.tsx` · `components/ui.tsx` |
| **4 Explore** | `app/explore/**` · `components/map.tsx` · `components/discovery-search.tsx` · `components/travel-options.tsx` · `components/ananta/explore/**` |
| **5 Trips** | `app/trips/**` · `components/ananta/feasibility-meter.tsx` · `components/ananta/trips/**` |
| **6 Detail and provenance** | `app/experience/**` · `components/ananta/provenance-badge.tsx` · `components/experience-media.tsx` · `components/report-button.tsx` · `components/ananta/provenance/**` |
| **7 Why this and why not** | `components/ananta/why-this.tsx` · `why-this-live.tsx` · `why-not-that.tsx` · `learning.ts` · `components/plan-button.tsx` · `plan-badge.tsx` · `save-button.tsx` · `share-button.tsx` · `components/ananta/why/**` |
| **8 Stress and learning** | `components/ananta/stress-radar.tsx` · `learned-weights.tsx` · `app/profile/**` · `app/saved/**` · `components/ananta/learning/**` |
| **9 Disruption** | `components/ananta/replan.ts` · `replan-proposal.tsx` · `app/events/**` · `components/availability-picker.tsx` · `components/ananta/replan/**` |
| **10 Provider and admin** | `app/provider/**` · `app/admin/**` · `app/terms/**` · `app/privacy/**` · `components/ananta/provider/**` |

Shared-write surface: `UI-UX-Fix-Prompts/BLOCKERS/<N>.md`, append-only, one file per
session. That is the only file more than one session may touch, and appending to
your own numbered file cannot conflict.

Frozen, nobody edits: `lib/seed.ts` · `lib/engine/**` · `lib/data/**` · `package.json` ·
`next.config.mjs` · `tsconfig.json` · `.eslintrc.json` · `vitest.config.ts` ·
`docs/**` · `../SESSION/**`

If the engine lacks something you need, that is a blocker, not a local copy. See
RULE 0.

---

## 7. Definition of done, every session

1. `npx tsc --noEmit` clean for your own paths. Other sessions' errors are expected
   while `tokens.ts` lands; filter, do not fix.
2. `npm run lint` clean. No em dash, no emoji.
3. `npx vitest run lib/ui-guard` green, including the fork guard, which proves you
   did not duplicate the engine.
4. All nine `UiState` values render something deliberate **on your own screens**. A
   state that renders a blank div is a bug.
5. Every new string passes the point-at-the-field test.
6. No hard-coded dataset number. Import from `@/components/ananta/records`.
7. `git status --short` shows only paths from your ownership row.
8. Keyboard-only pass of your screens with a visible ring at every stop.
9. 390px and 1440px, no horizontal overflow.
10. Every blocker written to `BLOCKERS/<N>.md`, including the ones you worked around.
11. A closing summary naming what you built, what you deliberately skipped, the known
    ceiling of what you built, and the one command that proves it works.

Item 11 matters. `ponytail:` comments naming a ceiling and its upgrade path are
welcome. "This is greedy insertion, not Held-Karp, and at 4 stops the gap is under
3%" is worth more than a claim of optimality.
