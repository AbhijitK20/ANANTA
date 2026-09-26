# ANANTA — UI/UX Design Specification

> Binding for every session touching `app/`, `components/`, or the visual layer.
> Ratifies what is already built. Specifies what is missing. Owns nothing that
> another session is currently editing.

---

## 0. BLOCKING PREREQUISITE — read this before any visual work

`components/ananta/pipeline.ts` (1356 lines) contains a **complete second
implementation of the engine**, inside a React component file:

| Duplicate | In `pipeline.ts` | Canonical owner |
|---|---|---|
| `tokenize` | `:240` | `lib/engine/retrieve/tokenize.ts` |
| `buildIndex` | `:247` | `lib/engine/retrieve/index-builder.ts` |
| `retrieve` | `:323` | `lib/engine/retrieve/retrieve.ts` |
| `gate` | `:409` | `lib/engine/feasibility/gate.ts` |
| `wilsonLowerBound` | `:603` | `lib/engine/scoring/wilson.ts` |
| `objectiveFast` | `:921` | `lib/engine/scoring/objective-fast.ts` |
| `pack` | `:1043` | `lib/engine/packing/pack.ts` |
| `objectiveNaive` | `:1163` | `lib/engine/validation/objective-naive.ts` |
| `validate` | `:1259` | `lib/engine/validation/validate.ts` |
| `relax` | `:1319` | `lib/engine/validation/ladder.ts` |
| `rank` | `:1376` | does not belong in the view layer at all |

It imports only two things from `@/lib/engine`: a type block at `:20-21` and
`COMPONENT_IDS, getCityManifest, rejectionSentence`. Everything else is
reimplemented.

**Why this is the most urgent item in the repository, above every visual
decision below.**

1. **The 1e-6 independence guarantee is defeated.** `objectiveFast` at `:921` and
   `objectiveNaive` at `:1163` are now two functions in the same 1356-line file,
   240 lines apart, surrounded by the same helpers. A "second, deliberately naive
   derivation that shares no code with the first" cannot share a file. The drift
   test in `lib/engine/validation/drift.test.ts` now measures a function against
   its own neighbour. **This is the project's single credibility anchor and it
   currently proves nothing.**
2. **The no-model guard does not cover it.** Session 1's
   `lib/engine/guard/no-model.test.ts` walks `lib/engine/**`. An entire engine copy
   sits outside that boundary, in a directory the guard does not read.
3. **Two BM25 implementations, two gates, two packers.** They will drift, and
   nothing detects it.
4. **Sessions 2 through 7 built the engine and the UI is not calling it.** The
   components in `components/ananta/*.tsx` are genuinely well made and read from
   `pipeline.ts`, so the visible numbers are not the numbers the engine produced.

**Required fix, and it is a deletion, not a rewrite.**

```bash
# 1. Confirm the UI only needs data plumbing, then strip the engine.
#    Keep in pipeline.ts: PLAN_BUFFER_MINUTES, minutesOfDay, clockLabel,
#    hoursLabel, inrLabel, todayStamp, contextFromInput, weightsFor,
#    EngineInput, PipelineRun, runPipeline (thin orchestration only),
#    CATALOGUE_INDEX, COMPONENT_LABEL, UTILITY_COMPONENTS, stopTotals,
#    StopTotals, makeTravelOptions, buildStops, routeOrder, clamp, round, mean.
# 2. Every one of the eleven functions in the table above becomes a re-export:
#      export { gate, retrieve, pack, validate, relax, objectiveFast,
#               objectiveNaive, wilsonLowerBound, tokenize, buildIndex } from "@/lib/engine";
# 3. Delete `rank` from the view layer. Ranking belongs to the engine.
# 4. Split what remains. Target: pipeline.ts under 250 lines, and the run
#    orchestration in a separate file from the vocabulary maps.
```

Then **widen the guard** in `lib/engine/guard/no-model.test.ts` to also cover
`components/ananta/**` and `app/**`, because a UI file that can reach a model
endpoint is the same violation.

**And the reason it happened is worth naming.** Session 9 started before sessions 2
to 7 landed, and instead of blocking on them as `00-CONTRACTS.md` section 8
requires, it wrote its own. The contract said: *"If session 5 has not landed, show
an honest 'solving' state and report the dependency in your blockers file. Do not
paper over it with a `slice`."* A local engine copy is the largest possible paper
over. **Check `SESSION/BLOCKERS/` for whether this was reported. If it was not, the
blocker protocol needs teeth, because nine sessions reading the same contract
produced one silent fork.**

**Do not begin any visual work in this document until step 2 above is done.** Every
number the UI renders must come from the engine, or the honesty claims in section 5
are decorative.

---

## 1. What is already built and ratified

Do not redo any of this. It is good, it follows the rules, and it is the visual
foundation.

**Tokens, live in `tailwind.config.ts`:**

```
ink #18202B · muted #667085 · line #DDE3EA · canvas #F4F6F8
blue #175CD3 · blueSoft #E8F0FF · green #087443 · greenSoft #E8F5EE
amber #A15C07 · amberSoft #FFF4D6
shadow-card 0 12px 32px rgba(24,32,43,.07) · shadow-float 0 20px 55px rgba(24,32,43,.14)
```

Royal blue primary, white and light grey surfaces, charcoal text. That satisfies
`docs/05-design/DESIGN-CONTRACT.md:32-35` and the "never use" list at `:15-27`.

**Built components in `components/ananta/`**, all consuming real engine output:

| File | Ratified for |
|---|---|
| `feasibility-meter.tsx` | The signature element. Activity, travel and buffer as three segments, overflow past the track, `role="img"` with a full sentence, honest footnote at `:117-121`. |
| `why-this.tsx` | Ranked by descending absolute contribution, signed number, weight and normalised value shown, overflow count stated. Replaced `reasons.slice(0, 3)`. |
| `why-not-that.tsx` | Typed rejections, blocking and advisory separated, shortfall in the declared unit, provenance of the causing fact, and the cheapest relaxation. |
| `provenance-badge.tsx` | Per-field provenance and confidence with meaning text. Replaced one `confidence` string per record. |
| `learned-weights.tsx` | The editable weights panel. |
| `stress-radar.tsx` | 7 factors, 0 to 100, one rescue move for the worst. |
| `replan-proposal.tsx` | The accept, view alternatives, keep original proposal. |
| `components/footer.tsx` | Makes `/privacy`, `/terms`, `/provider`, `/admin` reachable on mobile. |

**Accessibility already fixed and ratified:** the real `:focus-visible` ring at
`app/globals.css:152-167` with the inversion on blue surfaces, `.sr-only` at
`:168`, keyboard-reachable `.place-pin` buttons at `:66-76`, the
`prefers-reduced-motion` block at `:128-131`, the skip link at `:133-143`.

**Preserve:** `PAGE_SIZE = 24` paging discipline. `docs/05-design/DESIGN-CONTRACT.md:82`
forbids autoplaying media in cards. `docs/06-quality/ACCESSIBILITY.md:11` requires a
list alternative for every map result.

---

## 2. The design thesis, in one line

> **"We don't know" is a first-class visual state, not an error state.**

Every other product in this category handles uncertainty by hiding it or by
guessing. This one shows it. A screen that says "opening hours are unverified, so
we will not claim it is open" is **more** trustworthy than one that shows a
fabricated `10:00 to 19:00`, and it has to *look* that trustworthy, not like a bug.

So the visual system has two jobs, in priority order:

1. Make a refusal look as considered as a recommendation.
2. Make a number's provenance readable in under a second.

Everything below serves those.

---

## 3. Tokens still missing

`tailwind.config.ts` has colour and shadow. It needs these. **Assign an owner
before anyone edits it: `tailwind.config.ts` is currently in nobody's `ALLOWED`
list, which is how two sessions ended up with two `CONFIDENCE_TONE` maps.**

### 3.1 Type scale

Seven steps. Replace every ad-hoc `text-[13px]` with one of these.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `text-micro` | 11px / 16 | 600 | provenance tags, unit suffixes, "N more" |
| `text-meta` | 12px / 20 | 400 to 600 | timestamps, footnotes, axis labels |
| `text-body-sm` | 13px / 20 | 400 | dense card body, table cells |
| `text-body` | 15px / 24 | 400 | **default.** card body, descriptions |
| `text-lead` | 17px / 28 | 400 | section intro, the meter's headline line |
| `text-title` | 21px / 28 | 700 | section headings |
| `text-display` | 28px / 34 | 700 | one per screen, the page's single claim |

Rule: **one `text-display` per screen.** If two elements want it, one of them is a
section heading. The meter's headline at `feasibility-meter.tsx:54` is correctly the
largest thing on the Trips screen.

### 3.2 Space, radius, elevation, motion, layer

```
space:   4 · 8 · 12 · 16 · 24 · 32 · 48 · 64      (no 5, 7, 13, 18, 22)
radius:  2 (chips) · 4 (inputs) · 6 (cards) · 999 (dots and cluster badges only)
shadow:  card (resting) · float (map popups, sheets, sticky bars) · none
motion:  120ms ease-out (hover, focus) · 200ms ease-out (state change, disclosure)
         1600ms linear infinite (the route dot, the only decorative motion)
z-index: 0 base · 10 sticky bar · 20 dropdown · 30 map popup · 40 sheet · 50 skip link
```

`DESIGN-CONTRACT.md:85-90` permits short transitions for state changes and requires
that no animation be needed to understand content. The single decorative animation
is the travelling route dot, already reduced-motion guarded at
`app/globals.css:128-131`. **Do not add another.**

### 3.3 Consolidate the duplicated maps

`CONFIDENCE_TONE` is defined twice, in `provenance-badge.tsx` and
`why-not-that.tsx:16-21`. Two definitions of the same visual language will drift,
and when they do, a rejection and a badge will disagree about what "unverified"
looks like.

Create **one** `components/ananta/tokens.ts` exporting `PROVENANCE_TONE`,
`CONFIDENCE_TONE`, `PROVENANCE_MEANING`, `CONFIDENCE_MEANING`, `FIELD_LABEL`,
`ACCESS_LABEL`, `COMPONENT_LABEL`, `SEGMENT_TONE`, and the scale constants. Import
from it everywhere. This is the fix for the bug class catalogued in
`.opencode/skills/ananta-bug-catalog` under "computed but discarded and duplicated
maps".

---

## 4. The knowledge-state grammar

This is the part that makes the product legible. Six states, one visual treatment
each, used identically in a badge, a rejection, a filter chip, and a table cell.

| State | Colour | Chip | Meaning, verbatim |
|---|---|---|---|
| `verified` | `green` on `greenSoft` | solid | Matched to a source we can name. |
| `community` | `blue` on `blueSoft` | solid | Reported by a resident or a provider. |
| `estimate` | `amber` on `amberSoft` | **outlined, not filled** | A computed estimate. The number is our arithmetic, not a claim. |
| `unverified` | `muted` on `canvas` | **outlined, dashed border** | We do not know this yet. |
| `derived` | `blue` on `blueSoft` | solid | Computed from facts we do have. |
| `mixed` | `muted` on `canvas` | **split chip, two halves** | Some fields verified, some not. Never collapse this to one. |

Two rules that carry the whole idea:

- **`estimate` is outlined, never filled.** A filled amber chip reads as a warning
  about a fact. An outlined one reads as "this is a number we produced". Different
  claim, different shape.
- **`mixed` never collapses.** A record with OSM coordinates and a hash-derived
  price is `mixed`, and must never be summarised as `verified`. That collapse is how
  the previous build ended up with 1064 records labelled "Curated record" whose
  every price was `hash(id) % band`.

**The `unverified` chip is the one to get right.** It appears next to opening hours
on most of the long tail. It must read as considered, not broken: dashed border,
`muted` text, and a tooltip or popover that says what is missing and what would fix
it. Never a red cross, never a spinner, never a dash.

---

## 5. State catalogue

The product has more honest states than a normal app, and most of them are not
"loading" or "error". Every screen needs all of these designed. A state that
renders as a blank div is a bug.

| State | Trigger | Required treatment |
|---|---|---|
| **Solving** | pipeline running | Show the **stage**, not a spinner. "Gate: 1107 to 23" then "Packing". Stage visibility is the demo. Keep it under 400ms or it is instant. |
| **Nothing fits** | every candidate rejected | The **cheapest relaxation**, with the count it unlocks. Never "No results". `DESIGN-CONTRACT.md:58` gives the register: "There are not enough verified results for these filters." |
| **Nothing retrieved** | isochrone + BM25 empty | Say which filter emptied it, and name the one control to widen. "Nothing within a 25 min walk. Widen to 40 min to see 12 more." |
| **Partially unknown** | `unverified` fields present | Advisory chips, visually subordinate to blocking rejections. Already correct in `why-not-that.tsx:91-108`. |
| **Abstained** | gate declined to judge | Distinct from "rejected". "We will not claim it is open, because hours are unverified." Never renders as an error. |
| **Routing down** | OSRM failed | Render the straight-line estimate with `lib/routing.ts:179-186`'s label. Already implemented. Never a blank directions panel. |
| **Offline** | no network | The app is offline-capable by design. Say so positively: "Running on the committed snapshot. Live routing is unavailable." |
| **Sold out** | availability | Show it as a fact with its timestamp, and route to the replan proposal, not to an error. |
| **Genuinely broken** | an exception | One plain sentence naming what failed and what still works. Never a stack trace, never a shrug. |

The last row is the only one that may look like a failure, and even then it must
say what still works.

---

## 6. Screen specifications for the demo path

Six screens. This is the judged path, so it gets the design attention.

### 6.1 `/` Landing

One `text-display` claim, one sentence of subtext, one primary action, one
credibility line. No hero image pretending to be a place.

```
eyebrow    ANANTA · not a listings site
display    Everything below fits your 3 hours.
subtext    Give us a window, a budget, and who you are with.
           We show our work, including what we refuse and why.
[primary]  See what fits          -> /explore
line       No sign-up. No booking. No live availability claims.
credibility  1,107 real Mumbai and Navi Mumbai places.
             391 pinned to OpenStreetMap. Prices and durations are
             labelled estimates. 47 records carry hand-checked facts.
```

The credibility line is not decoration. It is the product's argument, and it must
be on the first screen, because a judge decides in five minutes and
`docs/05-design/DESIGN-CONTRACT.md:17-19` bans fake metrics while requiring
specific copy. Take the numbers from `lib/data/ananta/records.ts`, which already
exports `DATASET_SIZE`, `HAND_WRITTEN`, `OSM_MATCHED`, `CURATED_CATEGORY_COUNT`.
**Never hard-code them.**

### 6.2 `/explore` Workspace

Desktop: results list left, map right, filter rail. Mobile: filters collapse to a
sheet, map scrolls away above the results, and the existing `hide-mobile` utility
at `app/globals.css:181-183` handles the collapse.

Every result card carries, in this order and this priority:

1. **Name and area.** One line.
2. **The binding facts.** Duration, travel, price, open or not. Real numbers, no
   adjectives.
3. **Why this**, collapsed to the top two ranked components, expandable to all.
4. **Provenance strip.** The mixed chip, plus micro-labels on any `estimate` field
   adjacent to that field's number, not in a footer.
5. **Add to plan.** One implementation, used here and on the detail page.

Filter rail: facets with live counts from `lib/engine/retrieve/facets.ts`. The
`unknown` price bucket must be visible and must not be folded into `free`.

Show the retrieval count under the results heading: **"120 of 1,107 considered."**
It makes stage 1 of the pipeline visible and costs one line.

### 6.3 `/experience/[id]`

Hero, then the graded facts as a **definition list with a provenance badge per
row**. That table *is* the product. One `unknown` row:

```
Opening hours      Unverified            We do not know yet. Ask the provider.
```

Which reads as a designed answer, because it is one.

Then: access, diet, indoor or outdoor, capacity, seasonality, best time of day,
media, and a report button. `notFound()` for an unknown id, already required.

### 6.4 `/trips` The proof screen

Order matters. A judge should hit the evidence before the plan.

```
1  FeasibilityMeter        the signature element, full width
2  Validation stamp        "Objective re-derived independently. Drift 0.000000."
3  Stress radar            7 factors, worst one first, one rescue move
4  The plan                stops, real clock or no clock, per-stop why-this
5  Relaxation note         if a rung was walked, which and what it cost
6  Trigger controls        six one-click buttons
7  Replan proposal         only when a trigger has fired
```

Item 2 is the highest-value single element on the site and it is currently
missing. `lib/engine/validation/validate.ts` returns `drift` and
`satisfiedFraction`. Render them. A judge who sees **"Drift 0.000000"** next to a
plan they are about to trust is a judge who believes the engine.

**On the clock.** If `Stop.arriveBy` is real, show the clock. If it is not derived
from a start time the traveller has seen, show `Stop 2` and the durations. Never a
string template. The old code rendered `` `${index + 1}:15 PM` `` and it was the
worst honesty defect in the repository.

### 6.5 `/provider` and `/admin/operations`

Provider: listing, availability, request inbox, and the **unmet-demand feed** as
the top block, because it is the part that matters. Each row states the dominant
rejection in a finished sentence with the count it would unlock. Never a bar chart
of made-up numbers. `app/provider/page.tsx:31`'s `Math.max(counts[id], 4)` is
fabricated data and must not survive.

Admin: a real **publish** action that inserts a submission into the discoverable
catalogue, and a stale state that actually removes something from ranking. If
"Remove from ranking until checked" is in the tooltip, the code must do it.

### 6.6 Footer, on every screen

Privacy, Terms, Provider, Operations. Session 9 has built it. It is what makes
legal pages reachable on mobile, which
`docs/06-quality/ITERATIVE-BROWSER-QA.md:29` names as the primary demo viewport.

---

## 7. Responsive rules

| Breakpoint | Layout |
|---|---|
| under 640 | single column, filters in a sheet, bottom nav, map collapsed above results |
| 640 to 1024 | single column results, filter rail becomes a horizontal scroller |
| 1024 to 1440 | two column, list 5 of 12, map 7 of 12 |
| over 1440 | capped at 1480px and centred. Do not let a line of text exceed about 70 characters. |

Touch targets: minimum 44 by 44 CSS pixels on mobile. `components/ui.tsx:20`
currently uses `min-w-[58px] px-3 py-3` on the bottom nav, which is fine.

No horizontal overflow at 390px. Both QA scripts assert it, and once they are
runnable it is a hard gate, not a guideline.

---

## 8. Accessibility conformance targets

`docs/05-design/ACCESSIBILITY.md` is a 14-line checklist. These are the measurable
targets behind it, so "compliant" stops being a matter of opinion.

| Requirement | Target | Verified by |
|---|---|---|
| Contrast, body text | 4.5:1 minimum | `ink` on `canvas` is 13.9:1. `muted #667085` on `white` is 4.9:1. `amber #A15C07` on `amberSoft` is 4.6:1. All pass. |
| Focus visible | every interactive element, 3px ring | `app/globals.css:152` **done** |
| Keyboard reach | all content reachable without a pointer | Map markers are real buttons, **done**. The map as a whole is not keyboard navigable, so the list must be documented as the accessible path in the UI. |
| Chart alternatives | the radar has a table equivalent | **Not done.** Required. A 7-axis radar is unreadable to a screen reader and useless in print. Ship the table beside it, visually collapsed. |
| Status not by colour alone | every tone has text | Chips carry text. `availability-picker.tsx:68`'s dot is `aria-hidden` with no text equivalent, **fix**. |
| Dialog semantics | real focus trap or no `aria-modal` | **Not done.** `report-button.tsx:34` claims `aria-modal` without trapping. |
| Motion | no animation required for comprehension | **done**, `globals.css:128` |
| Live regions | solving and replan announce | Use `aria-live="polite"` on the pipeline stage line. |
| Zoom | 200% without loss of content | No fixed heights on text containers. The map's `h-[540px]` is fine, it is not text. |

Two new items beyond the current doc, both required by the honesty thesis:
**the stress radar needs a table equivalent**, and **the feasibility meter needs
its `role="img"` label to stay correct when a value is zero** (already handled at
`feasibility-meter.tsx:71`, keep it).

---

## 9. Copy rules, with examples

`docs/05-design/DESIGN-CONTRACT.md:28` bans em dashes. `.opencode/skills/ananta-honesty`
extends that to emoji and to fabricated claims. The register to hit:

**Do:**

```
Needs 40 min more than you have left.
Opening hours are unverified, so we will not claim it is open.
Seats 3; you are 4.
Objective re-derived independently. Drift 0.000000.
Relaxed: minimum 1 stop instead of 2.
Rain started. Your original goal was local and cultural, so both
replacements keep that. Nothing changes until you accept.
3 of 1,107 places have verified opening hours. The rest are unverified.
```

**Do not:**

```
Amazing local experiences awaits you          (vague, unsupported)
Sorry, no results found                       (dead end, no next step)
Highly rated by travellers                    (no rating data exists)
Verified local experiences                    (96% of the catalogue is not)
Live availability                             (nothing is live)
2:15 PM                                       (a string template, not a clock)
Your plan is optimised                        (unfalsifiable)
```

The test for every string: **point at the field or the function that produced the
claim.** If you cannot, delete the sentence.

---

## 10. Ownership, from here

The parallel phase is winding down and files are unowned again. Assign before
editing.

| File | Owner from now |
|---|---|
| `tailwind.config.ts` | **unowned. Assign now.** It is the token file and it has no owner. |
| `components/ananta/tokens.ts` | **new. Session 9.** Consolidates the duplicated maps. |
| `components/ananta/pipeline.ts` | **session 9.** Must be reduced to a thin orchestration layer per section 0. |
| `app/**` except `provider` and `admin` | session 9 |
| `app/provider/**` `app/admin/**` `app/terms/**` `app/privacy/**` | session 10 |
| `components/ananta/*.tsx` | session 9 |
| `app/globals.css` | session 9 |
| `docs/05-design/**` | session 10, and this file is the input to it |

**Nothing outside `components/ananta/` and `app/` may be edited to implement this
document.** The engine is frozen. If the UI cannot render something, the engine
needs a change and that goes through a blocker, not a reimplementation.

---

## 11. Quality gate

Run before any visual work is called done. Nine items, all checkable.

1. `grep -rn "fetch(\|Date.now()\|Math.random()" components/ananta/ app/` returns
   nothing. The UI layer has no engine and no clock.
2. `pipeline.ts` is under 250 lines and contains no function that also exists in
   `lib/engine/`.
3. `objectiveFast` and `objectiveNaive` are in different files, in different
   directories, and share no helper. Verify by reading both import blocks.
4. The guard test in `lib/engine/guard/no-model.test.ts` also covers
   `components/ananta/**` and `app/**`.
5. Every new string passes the point-at-the-field test. No exceptions, including
   in tests and comments.
6. Zero em dashes, zero emoji, in `app/`, `components/`, and `lib/`.
7. The stress radar has a table equivalent in the DOM.
8. Every state in section 5 renders something deliberate. Load the app with an
   empty result, an unroutable pair, and a no-network condition and confirm.
9. 390px and 1440px, no horizontal overflow, keyboard-only pass of the whole demo
   path with a visible focus ring at every stop.

---

## 12. The one-sentence brief

**Show the traveller a plan where every stop demonstrably fits, and make the
proof, the refusals, and the unknowns as easy to read as the recommendations.**

Everything above is in service of that sentence. When a design decision and this
sentence disagree, this sentence wins.
