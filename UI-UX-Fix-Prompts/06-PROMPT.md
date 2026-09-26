# SESSION 6 of 10 — Place Detail and Per-Field Provenance

> Copy everything below this line into a new session.

---

You are session 6 of 10 in the **UI/UX fix round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You own the screen that answers the traveller's real question, *"can I trust this?"*,
and the accessibility truth of the media and the report dialog.

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**. RULE 0, the knowledge-state
   grammar in section 2, the accessibility targets in section 4, your row in 6.
2. `SESSION/UI-UX-DESIGN.md` sections 4, 6.3 and 8.
3. `app/experience/[id]/page.tsx` (8419 bytes),
   `components/ananta/provenance-badge.tsx` (218 lines, exports `FIELD_LABEL`,
   `PROVENANCE_TONE`, `CONFIDENCE_TONE`, `PROVENANCE_MEANING`, `CONFIDENCE_MEANING`,
   `ACCESS_LABEL`),
   `components/experience-media.tsx`, `components/report-button.tsx`.
4. `lib/data/ananta/provenance.ts` and `lib/data/curated/types.ts` for
   `CuratedFacts`, which is where `reviewerNote` and `asOf` live.
5. `docs/05-design/MEDIA-POLICY.md` and `docs/04-data/MEDIA-POLICY.md`. Media
   licensing is a real compliance item here, not a style note.

## ALLOWED — you own these, exclusively

```
app/experience/**
components/ananta/provenance-badge.tsx
components/experience-media.tsx
components/report-button.tsx
components/ananta/provenance/**
UI-UX-Fix-Prompts/BLOCKERS/6.md
```

## FORBIDDEN

```
tailwind.config.ts, app/globals.css, components/ananta/tokens.ts, records.ts, lib/ui-guard/**   session 1
components/ananta/pipeline.ts, use-ananta.ts                                                   session 2
app/layout.tsx, app/page.tsx, app/contact/**, components/footer.tsx, components/ui.tsx         session 3
app/explore/**, components/map.tsx, discovery-search.tsx, travel-options.tsx                     session 4
app/trips/**, components/ananta/feasibility-meter.tsx                                          session 5
components/ananta/why-this.tsx, why-this-live.tsx, why-not-that.tsx, learning.ts,
  plan-button.tsx, plan-badge.tsx, save-button.tsx, share-button.tsx                              session 7
components/ananta/stress-radar.tsx, learned-weights.tsx, app/profile/**, app/saved/**            session 8
components/ananta/replan.ts, replan-proposal.tsx, app/events/**, availability-picker.tsx        session 9
app/provider/**, app/admin/**, app/terms/**, app/privacy/**                                    session 10
lib/**   FROZEN, including lib/data/**
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, vitest.config.ts, docs/**
```

**Your new components go in `components/ananta/provenance/`.** That directory is
yours alone.

## Task

### 1. The graded-facts table is the product

The detail page is where per-field provenance has to land, and
`docs/05-design/ACCESSIBILITY.md:12` requires "experience accessibility metadata
visible in the detail page". Until this round that line was a lie: the schema had
nowhere to put the data. Session 8 built `access`, `openingHours`, `capacity`,
`diet`, `indoor`, `kidFriendly`, `season` and `bestTimeOfDay` into
`ExperienceV2`. **Now it can be rendered.**

Build a definition list, one row per graded field, and on each row:

- The field name, from `FIELD_LABEL` in `tokens.ts` once session 1 lands. Import it.
  Do not retype a label string.
- The value, or an honest absence.
- A **provenance badge on that row**, using the knowledge-state grammar. Not one
  badge for the record. Per row.

**The absence row is the one that matters most.** It must look designed:

```
Opening hours    Unverified    We do not know yet. Ask the provider.
```

`confidence: "unverified"` gets the **dashed** chip from `CONFIDENCE_TONE`. It must
read as considered, not as a warning and not as a bug. `SESSION/UI-UX-DESIGN.md`
section 4 is entirely about getting this one chip right.

`accessibility` is a partial record, so rows for unrecorded needs read "Not
recorded", which is different from "No". **That distinction is the whole point of
per-field provenance** and it must survive to the screen. A traveller with an older
relative needs "not recorded" to mean "we do not know", never "no".

### 2. `provenance-badge.tsx` — move the duplicated maps out

`CONFIDENCE_TONE` is currently defined **twice**: here and again in
`components/ananta/why-not-that.tsx:16-21`, which is session 7's file. Two
definitions of one visual language, guaranteed to drift, and when they drift a
badge and a rejection will disagree about what "unverified" looks like.

Session 1 is writing `components/ananta/tokens.ts` with `PROVENANCE_TONE`,
`CONFIDENCE_TONE`, `KNOWLEDGE_LEGEND`, `mixedChip`, `FIELD_LABEL` and
`COMPONENT_LABEL` in the first 20 minutes of its run. **Delete your local copies
and import from `@/components/ananta/tokens`.** If it is not there yet, write the
import, accept the typecheck error, and continue. Do not re-declare the map. That
is the exact bug this round exists to remove.

Keep and extend:
- `PROVENANCE_MEANING` and `CONFIDENCE_MEANING`, so every chip has a plain-English
  popover, not just a colour.
- The `KNOWLEDGE_LEGEND` block. `app/explore/page.tsx:227-236` has a
  `ConfidenceLegend` today and it is the best honesty feature in the product. It
  should be reachable from here too, on the detail page, where a sceptical reader
  will actually want it.
- **A `mixed` state that never collapses.** A record with OSM coordinates and a
  hash-derived price is `mixed`, rendered with `mixedChip(verified, total)`. This is
  the rule that stops 1107 records being summarised as "verified" when roughly 96%
  of them are generated. `docs/05-design/DESIGN-CONTRACT.md:16-19` bans fake claims
  and this is where that ban is either honoured or not.

### 3. Four real defects on this page

**A wrong id returns 200.** `app/experience/[id]/page.tsx:34` uses
`?? allExperiences[0]`, so `/experience/anything-garbage` renders Kala Ghoda Art
Walk with HTTP 200. Use `notFound()`.

**"Share experience" is dead.** At `:35` it has no handler, no `href`. Wire it or
delete it. A control that does nothing is worse than no control, and this one is a
button a judge will press.

**The hero image is an area photo, not the venue.** 70 Wikimedia images serve 1107
records, so roughly 15.8 venues share each one. `:35` already discloses "Area
photo: {credit}. Shows the neighborhood, not the venue itself." **Keep that
sentence exactly.** It is the correct disclosure and removing it would be a lie.
The credit string itself is a separate problem session 8 owns: all 70 generated
images are credited the literal `"Wikimedia Commons contributor"`, which is not an
author and not a licence. If session 8 has not fixed it, keep the disclosure
sentence and add the honest note that the author is on file, and write a blocker.

**The media and the record are unrelated.** `components/experience-media.tsx:32`
carries an explicit `void fallbackTitle;` and discards the `fallbackTitle` prop at
`:8`. It is a deliberate no-op left by a previous session. Either use it or delete
the prop. Do not leave dead plumbing threaded through three files.

`docs/05-design/MEDIA-POLICY.md` requires creator and platform attribution, and
`DESIGN-CONTRACT.md:81` is explicit: **never use video as proof of price, hours,
availability, safety or booking state.** `factory.ts:261` already says "It shows the
surroundings, not the venue's current operations". Keep that. `DESIGN-CONTRACT.md:82`
forbids autoplaying media in cards, and `:84` forbids storing or re-hosting
third-party video, so keep URLs and metadata only.

### 4. `components/report-button.tsx` — stop lying in ARIA

`:34` sets `role="dialog"`, `aria-modal="true"` and moves initial focus to the close
button, then handles Escape and backdrop dismissal. **It does not trap focus.** Tab
escapes to the page behind. `aria-modal="true"` tells assistive technology the
content outside is inert, and it is not. **That is worse than no ARIA**, because a
screen-reader user is actively misled about where they are.

Two acceptable outcomes:

- **Implement the trap.** About fifteen lines: on `Tab`, query the focusable
  elements inside the dialog, wrap at both ends. Plus **focus restoration** on
  close, which is also missing, so focus currently falls back to `<body>`.
- **Drop `aria-modal`** and keep the honest `role="dialog"`. Simpler, and no longer
  a lie.

Prefer the trap, and if you take it, restore focus too. While you are in there, the
dialog has no `Field` usage, so the label, input and error are hand-rolled at
`report-button.tsx:34`. Session 3 is adding a `Field` primitive to
`components/ui.tsx`. Import it if it has landed; do not build a second one.

### 5. The `UiState` coverage

`abstained` is yours above anyone else's: a field the gate declined to judge, because
a fact is unknown. Contracts section 2 defines the copy and it must be visually
distinct from a rejection. "This is not a rejection" should be the reader's
realisation, not a caveat they have to infer.

Also `solving` for the record load, and `broken` for an unresolvable id, which means
`notFound()` needs a real page rather than a bare default.

## Constraints

- **RULE 0: no engine in the view layer.** Read records through
  `@/components/ananta/records` and types from `@/lib/engine`. Do not reimplement a
  provenance resolver, and do not import from `lib/data/ananta/provenance.ts`
  directly, since that is session 8's frozen file. `records.ts` is session 1's
  re-export surface.
- Zero new dependencies.
- No em dash, no emoji. No hard-coded dataset number.
- "Not recorded" and "No" must be visually and semantically different everywhere on
  this page. Write a test if you can, or at minimum assert it by hand in your
  summary.
- One `text-display` on this screen.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib/ui-guard
npm run dev
```

Then: open a curated record and a generated one side by side. Their badges must
**look different**, because their data is different. That is the single test of
whether per-field provenance is real. Then tab through the report dialog and confirm
focus cannot escape. Then hit a bogus id and confirm a real 404.

## Definition of done

1. The graded-facts table renders every field with a per-row provenance badge.
2. `unverified` renders as the dashed chip and reads as considered, not as a warning.
3. "Not recorded" and "No" are distinct in both copy and styling.
4. `mixed` never collapses to a single verified state. A mixed record shows a mixed
   chip.
5. The duplicated tone maps are gone from this file, imported from `tokens.ts`.
6. `notFound()` on an unknown id, with a real page behind it.
7. "Share experience" is either wired or removed. No dead controls.
8. The area-photo disclosure sentence is intact and unmodified.
9. The report dialog traps focus **and** restores it, or does not claim
   `aria-modal`.
10. The `void fallbackTitle` no-op is gone, along with its dead prop.
11. `git status --short` shows only your five path patterns.
