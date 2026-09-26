# SESSION 3 of 10 — The First Five Seconds in Three Dimensions

> Copy everything below this line into a new session.

---

You are session 3 of 10 in the **spatial UI round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You own the first five seconds and the frame around every other screen. A judge
decides in five minutes, and this session is most of that five minutes.

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**. Sections 2, 3, 4 and 7, then
   section 6 for the encodings, then your row in 10.
2. `SESSION/UI-UX-DESIGN.md` sections 2, 4 and 6.1.
3. `app/layout.tsx` (578 bytes), `app/page.tsx` (7682 bytes),
   `components/footer.tsx`, `components/ui.tsx` (21 lines, 3 exports),
   `app/contact/page.tsx`.
4. `components/ananta/records.ts` and, once session 1 lands, its `credibilityLine()`.
5. `docs/05-design/DESIGN-CONTRACT.md` lines 13 to 56.

## The tension you must get right

`DESIGN-CONTRACT.md:24` bans "decorative glassmorphism or generic AI effects" and
`:22` bans "excessive scroll-triggered animation". You are about to add depth. The
contracts section 0 is the reconciliation, and you are where it either works or
fails.

**The landing is the one screen where 3D is most at risk of becoming decoration,
because a landing page has no data to encode yet.** So on this screen depth does
exactly one job: **it separates the layers of a claim.** The claim is elevated, the
evidence is flush, the caveat is recessed. Three planes, and each one is load
bearing.

If you find yourself adding depth that carries no information, delete it. The test
is the 2026 rule: if the page would still feel right with motion off, it is right.

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
tailwind.config.ts, app/globals.css, tokens.ts, records.ts, lib/ui-guard/**     session 1
components/ananta/pipeline.ts, use-ananta.ts                                    session 2
app/explore/**, map.tsx, discovery-search.tsx, travel-options.tsx                session 4
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

## Task

### 1. `app/layout.tsx` — the meta description is a lie

`app/layout.tsx:6` reads **"Find **verified** local experiences, places, and
events"**. About 96% of the catalogue is generated with hash-derived prices and
durations, and the dataset's own `confidence` string says "visit facts are demo
estimates". This is the first thing any crawler and any judge reads. Rewrite it
truthfully.

Also:
- **Keep the skip link at `:14` and its `:focus` reveal.** Ratified, and it is the
  one thing that makes a keyboard user able to skip a 3D hero.
- Add `openGraph` and `twitter` metadata. Only reference an image that exists on
  disk; omit the key rather than point at nothing.
- Keep `lang="en"` and `id="main-content"`.
- **No 3D on `<body>` or `<main>`.** A transform on a container holding
  `position: fixed` descendants, which the footer and bottom nav are, creates a
  stacking-context bug that manifests as a phantom scroll. If you want depth on the
  page shell, put it on an inner wrapper that contains no fixed elements.

### 2. `app/page.tsx` — three planes, per section 7 above

One `text-display` claim. One primary action. One credibility line. No hero image
pretending to be a place: the images are 70 area photos shared across 1107 records,
and `DESIGN-CONTRACT.md:25` bans stock-like imagery presented as a real place.

**Plane 1, `depth-lifted`, the claim.** The single `text-display` line. Nothing
else may claim `lifted` on this screen.

**Plane 2, `depth-flush`, the evidence.** The credibility line, rendered from data:

```tsx
import { credibilityLine } from "@/components/ananta/records";
```

If session 1 has not landed it, import it, accept the typecheck error, continue. **Do
not write 1107, 391 or 43 yourself.** `DESIGN-CONTRACT.md:17-19` bans fake metrics
and `lib/ui-guard/hardcoded-numbers.test.ts` will fail your build.

**Plane 3, `depth-recessed`, the caveats.** What the product does not do: no
sign-up, no booking, no live availability, no payments, no ratings. **Recessed, not
hidden.** Listing the absences quietly underneath the claim is more convincing than
listing the presences, and putting them on their own plane says *"we put these
further away deliberately"* rather than hiding them.

- The primary CTA is currently dead: `components/discovery-search.tsx:33` "See what
  is nearby" has no `onClick`, no `href`, no `type`. It is session 4's file. **Use a
  real `<Link href="/explore">` for your action and leave the chip strip to session
  4.** Say in your summary that session 4 must not reintroduce a dead control.
- A hover lift on the primary action, one step, `rotateX` at most 3 degrees.
- **Exactly one** `text-display` on the screen. A second one means one of them is a
  `text-title`.

### 3. `components/ui.tsx` — the primitives, now spatial

**Do not build a component library.** The app looks consistent because the copy is
disciplined, and `SESSION/UI-UX-DESIGN.md` says so. But close three real gaps:

- **Delete `ButtonLink`** if still unused. It is dead.
- **Add `Button`** with `primary` filled blue, `secondary` white with a `line`
  border, `ghost` transparent. Rectangular, modest radius, per
  `DESIGN-CONTRACT.md:35`. **Not a pill**, which `:16` bans as the default. Each
  variant gets a fixed depth so a primary action is `depth-raised` and a ghost is
  `depth-flush`, and **the depth never changes between states**, because a control
  that jumps in Z on hover disorients.
- **Add `Field`** for label, input, hint and error, with the `htmlFor` pairing and
  `aria-describedby` wired once. Three files currently each have their own copy.
- Add `VisuallyHidden` wrapping the ratified `.sr-only`.
- **Keep `StatusLabel` exactly as it is.** 22 usages, and its three tones each carry
  text, which is what `ACCESSIBILITY.md:8` requires. **Do not give it depth.** It is
  a status token, not a plane, and a chip that floats is a chip that means something
  else.
- Keep `BottomNav` and its `PlanBadge` slot, and the mobile spacer that prevents
  overlap. **The nav is `position: fixed`, so it must not be inside a 3D container.**

### 4. `components/footer.tsx` and `app/contact/**`

The footer carries Privacy, Terms, Contact, and the route into Provider and
Operations. It is what makes the legal pages reachable on mobile, which is the
primary demo viewport because there is no other navigation to them at that width.

`app/contact/page.tsx` exists. Make the report path reachable from here and state
plainly what a report does and who reads it.

**The footer is `depth-recessed` and stays there.** It is context, not claim. A
recessed footer also reads as quieter, which is correct, and it is one more place
the depth grammar is doing honest work rather than decoration.

### 5. `UiState` coverage

Contracts section 2's nine states. Your landing, contact and 404 paths handle
`solving`, `offline` and `broken`. `broken` is the only one that may look like a
failure, and even then it names what failed **and what still works**. No stack trace,
no shrug. **Recessed, not red.** An error state in the alarm colour and a recessed
one carry different meanings: red says "you did something wrong", recessed says
"this is not available to you right now", which is usually the truth.

## Constraints

- **Zero new dependencies.** No motion library, no 3D library, no component library.
  `@phosphor-icons/react` is already installed and `DESIGN-CONTRACT.md:36` requires
  a consistent icon library; that is the one.
- **Class names only for depth.** Never `style={{ transform }}`. A runtime style
  bypasses the reduced-motion block and session 1's `reduced-motion.test.ts` will
  fail the build.
- Never put a `position: fixed` element inside a 3D container.
- No em dash, no emoji, no hard-coded dataset number.
- Do not edit a file you do not own. Nine people are here.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib/ui-guard
npm run dev
```

Then **measure**, because a spatial design that has not been measured is a guess:

1. DevTools Performance, record a hover on the primary action. **The main thread
   must be idle and GPU frame time under 16 ms.** If the main thread is doing work,
   the transition is not compositor-only and it will stutter on a judge's laptop.
2. Emulate `prefers-reduced-motion: reduce`. The three planes must still be
   distinguishable **by colour and border alone**, with no movement.
3. 1440px and 390px: no horizontal overflow, and **no layout shift** when the depth
   layer lands. A translateZ that changes layout is a bug.
4. Tab from the skip link to the footer. A ring at every stop, and the fixed nav
   does not jump.

## Definition of done

1. The meta description makes no claim the data cannot support. No "verified".
2. `openGraph` and `twitter` present, referencing nothing that does not exist.
3. The landing has exactly three planes and each one is load bearing: claim lifted,
   evidence flush, caveats recessed. You can say in one sentence what each carries.
4. The credibility line is rendered from `credibilityLine()`, with no hard-coded
   number.
5. The primary action is a real `Link` and navigates. No dead controls on this screen.
6. `ButtonLink` deleted, `Button` and `Field` added and used at least once each.
7. `StatusLabel` unchanged and at `depth-flush`, never floating.
8. The footer is recessed and all four links resolve at 390px.
9. No fixed element inside a 3D container. No `style={{ transform }}`.
10. Measured frame time under 16 ms with an idle main thread, and reduced motion
    still readable by colour alone.
11. `git status --short` shows only your five path patterns.
12. Your summary names every sentence you deleted, and every 3D effect you added
    **and what information it carries.** An effect you cannot justify in that clause
    should have been deleted.
