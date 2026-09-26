# SESSION 6 of 10 — Detail: Per-Field Provenance as Depth, and the ARIA Lie

> Copy everything below this line into a new session.

---

You are session 6 of 10 in the **spatial UI round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You own the screen that answers *"can I trust this?"*, and the accessibility truth
of the media and the report dialog.

## The one idea that makes this screen work

> **Uncertainty is recession.**

| Knowledge state | Depth | Plus |
|---|---|---|
| `verified` | `depth-raised` | solid green chip |
| `community` | `depth-raised` | solid blue chip |
| `estimate` | `depth-flush` | **outlined** amber. On the surface, because it is our arithmetic laid over the top |
| `unverified` | `depth-recessed` | **dashed**, 60% saturation, inset shadow |
| `mixed` | `depth-flush` | split chip, **never** collapsed to verified |

A reader learns that grammar on the explore grid, from session 4, and then arrives
here already fluent. **Your job is to keep it honest per field, and to be sure a
person who never saw the grid can still read every row.**

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
tailwind.config.ts, app/globals.css, tokens.ts, records.ts, lib/ui-guard/**     session 1
components/ananta/pipeline.ts, use-ananta.ts                                    session 2
app/layout.tsx, app/page.tsx, app/contact/**, footer.tsx, ui.tsx                 session 3
app/explore/**, map.tsx, discovery-search.tsx, travel-options.tsx                session 4
app/trips/**, components/ananta/feasibility-meter.tsx                           session 5
components/ananta/why-this.tsx, why-this-live.tsx, why-not-that.tsx, learning.ts,
  plan-button.tsx, plan-badge.tsx, save-button.tsx, share-button.tsx             session 7
components/ananta/stress-radar.tsx, learned-weights.tsx, app/profile/**, app/saved/**     session 8
components/ananta/replan.ts, replan-proposal.tsx, app/events/**, availability-picker.tsx   session 9
app/provider/**, app/admin/**, app/terms/**, app/privacy/**                     session 10
lib/**   FROZEN, including lib/data
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, vitest.config.ts, docs/**
```

New components go in `components/ananta/provenance/`. Yours alone.

## Task

### 1. The graded-facts table is the product

`docs/05-design/ACCESSIBILITY.md:12` requires "experience accessibility metadata
visible in the detail page". Until this round that line was a lie, because the
schema had nowhere to put the data. Session 8 built `access`, `openingHours`,
`capacity`, `diet`, `indoor`, `kidFriendly`, `season` and `bestTimeOfDay` into
`ExperienceV2`. **Now it can be rendered.**

A definition list, one row per graded field, and on each row:

- The field name from `FIELD_LABEL` in `tokens.ts`. **Import it, do not retype a
  label.**
- The value, or an honest absence.
- A **per-row provenance badge** and that row's depth. Not one badge for the record.
  Per row.

**The absence row is the one that matters most**, and depth is what makes it land:

```
Opening hours    Unverified    We do not know yet. Ask the provider.
```

`unverified` gets the **dashed** chip and `depth-recessed` with the inset shadow, so
the row looks **carved into the page** rather than greyed on top of it. That is the
difference between a considered absence and a broken field, and it is the single
strongest argument for doing this design in 3D: **an inset shadow says "we do not
know" in a way that no amount of grey never will.**

`access` is a partial record, so an unrecorded need reads "Not recorded", which is
**different from "No"**. A traveller with an older relative needs "not recorded" to
mean "we do not know", never "no". **That distinction is the whole point of per-field
provenance and it must survive to the screen.** Consider giving "not recorded" a
slightly different treatment from a recorded "no" beyond the chip, because both
being `depth-recessed` would blur them.

### 2. `provenance-badge.tsx` — delete the duplicated map

**`CONFIDENCE_TONE` is defined twice**, here and in
`components/ananta/why-not-that.tsx:16-21`, which is session 7's file. Two
definitions of one visual language, guaranteed to drift, and when they drift a badge
and a rejection disagree about what "unverified" looks like **on the same screen**.

Session 1 writes `components/ananta/tokens.ts` in the first 20 to 45 minutes of its
run. **Delete your local copies and import from `@/components/ananta/tokens`,
including `KNOWLEDGE_DEPTH`.** If it is not there yet, write the import, accept the
typecheck error, continue. Do not re-declare the map. That is the exact bug this
round exists to remove.

Keep and extend `PROVENANCE_MEANING` and `CONFIDENCE_MEANING` so every chip has a
plain-English popover, not just a colour. A chip that is only a colour is unreadable
to someone who cannot perceive depth, and `ACCESSIBILITY.md:8` requires text.

**Keep the `KNOWLEDGE_LEGEND`** that `app/explore/page.tsx:227-236` already has. It
is the best honesty feature in the product, and it belongs on this page too, where a
sceptical reader will actually want it.

**A `mixed` state that never collapses.** OSM coordinates plus a hash-derived price
is `mixed`, at `depth-flush`, via `mixedChip(verified, total)`. Roughly 96% of the
catalogue is generated, so this is the common case, and collapsing it to `verified`
would launder the dataset through a spatial channel. `DESIGN-CONTRACT.md:16-19`
bans fake claims and this is where that ban is either kept or lost.

### 3. Four real defects

**A wrong id returns 200.** `app/experience/[id]/page.tsx:34` uses
`?? allExperiences[0]`, so `/experience/anything-garbage` renders Kala Ghoda Art
Walk with HTTP 200. Use `notFound()`.

**"Share experience" is dead** at `:35`, no handler, no `href`. Wire it or delete
it. **A floating 3D button that does nothing is worse than a flat one**, because the
elevation invites the click.

**The hero image is an area photo, not the venue.** 70 images serve 1107 records, so
roughly 15.8 venues share each. `:35` discloses "Area photo: {credit}. Shows the
neighborhood, not the venue itself." **Keep that sentence exactly.** Removing it
would be a lie, and a `depth-lifted` hero makes a lie more convincing, not less. The
credit string is a separate problem session 8 owns; all 70 are credited the literal
`"Wikimedia Commons contributor"`, which is not an author and not a licence.

**Dead plumbing.** `components/experience-media.tsx:32` has an explicit
`void fallbackTitle;` discarding the prop from `:8`. Use it or delete the prop. Do
not leave dead plumbing threaded through three files.

`docs/05-design/MEDIA-POLICY.md` requires creator and platform attribution, and
`DESIGN-CONTRACT.md:81` is explicit: **never use video as proof of price, hours,
availability, safety or booking state.** `factory.ts:261` already says "It shows the
surroundings, not the venue's current operations". Keep it. `:82` forbids autoplaying
media in cards, `:84` forbids storing or re-hosting third-party video, so keep URLs
and metadata only.

### 4. `components/report-button.tsx` — stop lying in ARIA

`:34` sets `role="dialog"`, `aria-modal="true"`, moves initial focus to the close
button, and handles Escape and backdrop dismissal. **It does not trap focus.** Tab
escapes behind the dialog. `aria-modal="true"` tells assistive technology the
outside is inert, and it is not. **That is worse than no ARIA**, because a
screen-reader user is actively misled about where they are.

Two acceptable outcomes: **implement the trap** (about fifteen lines, wrap Tab at
both ends) **plus focus restoration on close**, which is also missing; or **drop
`aria-modal`** and keep the honest `role="dialog"`.

Prefer the trap, and if you take it, restore focus too.

**This matters more in a spatial design, not less.** The sheet treatment pushes the
page back to `translateZ(-40px) scale(.96)`, which signals "the outside is inert".
If focus can actually reach that pushed-back content, the spatial signal and the
behaviour now contradict each other, and a sighted keyboard user is misled as surely
as a screen-reader user. **Either trap the focus or do not push the page back.**

While you are in there, `:34` hand-rolls the label, input and error. Session 3 is
adding a `Field` primitive. Import it if it has landed; do not build a second one.

### 5. `abstained` is yours above anyone else's

Contracts section 2's `abstained` state: the gate declined to judge because a fact
is unknown. Visually distinct from a rejection, and "This is not a rejection" should
be the reader's realisation, not a caveat they have to infer. **Recessed is wrong
for this one**, because a recess reads as a rejection. Use `depth-flush` with the
muted tone, and let the copy carry the distinction.

## Constraints

- **RULE 0: no engine in the view layer.** Records come through
  `@/components/ananta/records` and `depthForRecord` from `pipeline.ts`. Do not
  reimplement a provenance resolver, and do not import `lib/data/ananta/provenance.ts`
  directly; that is frozen and session 1's `records.ts` is the surface.
- **Class names only.** No `style={{ transform }}`.
- **Never put a `position: fixed` element inside a 3D container.** The dialog is
  fixed, so the page push-back must be on an inner wrapper that does not contain it.
- Zero new dependencies. No motion library.
- No em dash, no emoji, no hard-coded dataset number.
- "Not recorded" and "No" must be distinct in copy **and** in treatment. Say how you
  achieved that in your summary.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib/ui-guard
npm run dev
```

Then:

1. Open a curated record and a generated one side by side. **Their rows must sit at
   different depths**, because their data is different. That is the single test of
   whether per-field provenance is real.
2. Emulate reduced motion. The unverified rows must still read as unknown from the
   dashed border and desaturation alone, with no movement.
3. Tab into the report dialog and confirm focus cannot escape. If you did not trap
   it, confirm you also did not push the page back.
4. Hit a bogus id and confirm a real 404.

## Definition of done

1. The graded-facts table renders every field with a per-row badge **and** that
   row's depth.
2. `unverified` renders dashed and recessed, and reads as carved rather than broken.
3. "Not recorded" and "No" are distinct in copy and in treatment.
4. `mixed` never collapses to verified. A mixed record is `depth-flush`.
5. The duplicated tone maps are gone from this file, imported from `tokens.ts`.
6. `notFound()` on an unknown id, with a real page behind it.
7. "Share experience" is wired or removed. No dead 3D controls.
8. The area-photo disclosure sentence is intact and unmodified.
9. The `void fallbackTitle` no-op and its dead prop are gone.
10. The dialog traps focus and restores it, **or** it does not claim `aria-modal` and
    the page is not pushed back.
11. `abstained` is visually distinct from a rejection.
12. `git status --short` shows only your five path patterns.
