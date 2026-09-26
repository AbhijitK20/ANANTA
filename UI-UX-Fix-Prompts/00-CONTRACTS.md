# ANANTA — Modern Spatial UI Contract

> **Depth encodes what we know, not how big a number is.**
> Supersedes `UI-UX-Fix-Prompts/00-CONTRACTS.md`. Read this before any visual work.

---

## 0. Why this does not violate your design contract

`docs/05-design/DESIGN-CONTRACT.md:24` bans "decorative glassmorphism or generic AI
effects" and `:22` bans "excessive scroll-triggered animation". A naive 3D layer
violates both. This document is the reconciliation, and it is not a loosening.

The 2026 literature is unusually clear on one point. From the spatial-UX guidance
surveyed: *"2026 is not the year 3D takes over. It is the year 3D stops being a
gimmick and becomes a product detail."* And separately, on the 2026 premium signal:
**"if the page would still feel premium with motion off, the design is right. If it
only feels premium because of motion, it is weak."**

More importantly, the research is equally clear that **depth is a poor channel for
encoding data values.** The CHI 2026 D-MO paper states the general problem
plainly: perspective projection affects apparent size, so a mark becomes ambiguous
between "small value" and "far away", and *"introducing depth as a visual channel
comes at the cost of ambiguity in size which is one of the few visual channels
effective at conveying quantity."* Munzner's taxonomy ranks depth below 2D size and
discourages it for non-spatial data.

**So we take depth and refuse the one job the research says not to give it.**

| Depth may encode | Depth may NEVER encode |
|---|---|
| Epistemic status: verified, estimated, unknown | A numeric magnitude or quantity |
| Interface hierarchy: what is primary right now | Distance, travel time, or price |
| Plan sequence: where you are versus what is ahead | Score, rating, or confidence as a number |
| Answer quality: which rung of the ladder produced this | Data at all, on a value channel |
| System integrity: whether the plan still agrees with itself | |

Result: a card that is **recessed** is unknown or rejected. A card that is
**raised** is verified or primary. A plan that **tilts** is drifting. Nothing is
ever placed further away because its number is smaller. `DESIGN-CONTRACT.md:23`
requires that restrained transitions appear "only when they clarify state". This
design has no transition that does not clarify state.

**The one-sentence brief:** a plan where every stop demonstrably fits, rendered so
that what is certain physically stands proud of what is not.

---

## 1. How we build it: CSS only, zero dependencies

Every technique below is CSS `transform` plus layered `box-shadow`. No Three.js, no
React Three Fiber, no Motion, no Framer Motion, no GSAP, no Lenis.

`MASTERPLAN.md` section 9 says **zero new dependencies, at all**, and the
`framer-motion` route on 21st.dev is a 34 to 45 kB gzip library that every
21st-listed motion component requires. Installing it would break a stated
non-negotiable to make cards tilt, which is about thirty lines of CSS.

**If you install `motion`, `framer-motion`, `three`, or `@react-three/fiber`, the
build is wrong and the guard test in section 9 fails it.** The techniques used here
are the ones the research calls "nearly free":

- CSS 3D transforms: hardware accelerated, no main-thread block.
- Transforms on `transform` and `opacity` only: compositor-only, under 1 ms a frame.
- Layered shadows: ambient occlusion, no renderer.
- Scroll-driven animation via `animation-timeline: view()` where supported, with a
  static fallback, since it runs on the compositor and avoids JS scroll listeners.

Perspective values: the research gives a usable band and a reason.
**`perspective: 1200px` is the default. Below 600px is cartoonish, above 2000px is
barely perceptible. We use 900 to 1400 and never outside it.**

---

## 2. The depth scale

Six steps. Not more. A six-step scale is legible; a twelve-step scale is noise.

| Token | `translateZ` | Use |
|---|---|---|
| `z-recessed` | `-10px` | Unknown, unverified, rejected, abstained |
| `z-flush` | `0` | An estimate. Sitting on the surface, because it is our arithmetic laid over the top |
| `z-raised` | `8px` | Verified or community reported. The default state of a good record |
| `z-lifted` | `18px` | Primary right now: the top result, the selected card, stop 1 |
| `z-floating` | `32px` | A proposal, a popover, the validation stamp |
| `z-foreground` | `48px` | A sheet or modal. The page recedes behind it |

Tilt: `rotateX` never exceeds **6 degrees**, and only on hover or on a real state
change. A card that stays tilted is a card that has been read as broken.

Recession also needs a non-depth cue, because a person who cannot perceive depth
must still read the same information. Every recessed element **also** desaturates
to 60% and takes the dashed border. Depth is the primary channel; desaturation and
the dashed border are the redundant ones.

---

## 3. Ambient occlusion, in five layers

One flat shadow reads as a sticker. Stacked shadows read as a surface. This is the
single cheapest visual upgrade in the whole document and it applies to everything.

Light comes from the top-left, which is the near-universal convention, and every
layer uses the same warm-tinted ink so the stack reads as ambient rather than
clinical.

```css
:root {
  --ink-rgb: 24, 32, 43;

  --shadow-z-flush:   0 1px 2px rgba(var(--ink-rgb), .04);
  --shadow-z-raised:  0 1px 2px rgba(var(--ink-rgb), .05),
                      0 2px 4px rgba(var(--ink-rgb), .04),
                      0 4px 8px rgba(var(--ink-rgb), .03);
  --shadow-z-lifted:  0 1px 2px rgba(var(--ink-rgb), .05),
                      0 2px 6px rgba(var(--ink-rgb), .05),
                      0 6px 12px rgba(var(--ink-rgb), .04),
                      0 12px 24px rgba(var(--ink-rgb), .03);
  --shadow-z-floating:0 2px 4px rgba(var(--ink-rgb), .05),
                      0 4px 10px rgba(var(--ink-rgb), .05),
                      0 10px 20px rgba(var(--ink-rgb), .04),
                      0 20px 40px rgba(var(--ink-rgb), .04),
                      0 32px 64px rgba(var(--ink-rgb), .03);
  --shadow-inset:     inset 0 2px 4px rgba(var(--ink-rgb), .05),
                      inset 0 1px 1px rgba(var(--ink-rgb), .04);
}
```

Offset and blur increase together while alpha decreases. That gradient is what
produces the occlusion read.

**The recession inset matters as much as the raised stack.** `--shadow-inset` on a
`z-recessed` element is what makes "we do not know this" look *carved* rather than
merely grey. It is the most important shadow in the product.

---

## 4. Motion tokens

Two durations, three curves, nothing else.

```css
--motion-hover:  120ms;
--motion-state:  200ms;
--motion-scene:  320ms;
--ease-out-soft: cubic-bezier(.22, 1, .36, 1);
--ease-inout:    cubic-bezier(.65, 0, .35, 1);
```

Rules, all from the sources:

- **Animate `transform` and `opacity` only.** Animating `width`, `height`, `top`,
  `left` or `box-shadow` forces layout or paint. Shadow stacks are therefore set
  once per depth step via a CSS custom property, never transitioned.
- **All motion is user-initiated.** Hover, focus, click, or entering the viewport.
  The guidance is explicit: *"Auto-playing 3D animations on page load. The GPU spins
  up, the fan turns on, and the user has not asked for it."* **No ambient looping
  animation anywhere.** The one existing exception, the travelling route dot at
  `app/globals.css:112-126`, is a directional indicator rather than decoration, so
  it stays, and it stays reduced-motion guarded.
- **`will-change: transform`** on elements that animate in 3D, and remove it after.
  Leaving it on permanently promotes the layer to GPU memory for the life of the
  page, and 1107 records is a lot of promoted layers.
- `transform-style: preserve-3d` only on an actual 3D container, because it creates
  a stacking context and interferes with `position: fixed` descendants.
- **Spring physics are hand-authored.** No library, so no overshoot. A card that
  overshoots on arrival is a card that looks like a toy.

---

## 5. Reduced motion is not optional, and it is not "turn it all off"

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
  /* Depth and status survive as static colour, because they carry meaning. */
  .depth-raised, .depth-lifted, .depth-floating, .depth-foreground { transform: none; }
  .depth-recessed { transform: none; filter: saturate(.6); }
  .tilt-by-drift  { transform: none; }
}
```

**This is the important part and it is the whole point.** The blanket reset kills
animation but **must not** kill meaning. A verified record is still `green`, an
unverified one is still dashed and desaturated, a rejection is still `amber`, and a
drifted plan is still flagged. Depth and motion are redundant encodings of state, so
dropping one leaves the other intact. That is what makes this design accessible
rather than merely decorated.

**The vestibular-disorder test:** with reduced motion on, walk the entire demo path
and confirm no remaining movement could disorient. Also confirm the flat layout
still carries every fact, because a 3D container is not semantic and a screen
reader cannot parse a scene.

---

## 6. The seven depth encodings, in priority order

This is the design. Everything else is implementation.

**1. Uncertainty is recession.** The most important rule in the document.

| Knowledge state | Depth | Plus |
|---|---|---|
| `verified` | `z-raised` | solid green chip |
| `community` | `z-raised` | solid blue chip |
| `estimate` | `z-flush` | **outlined** amber chip. On the surface, because it is our arithmetic laid on top |
| `unverified` | `z-recessed` | **dashed** muted chip, 60% saturation, `--shadow-inset` |
| `mixed` | `z-flush` | split chip, and it **never** collapses to verified |

A reader learns the grammar in about four seconds and then reads confidence without
reading a single word. That is the payoff of doing 3D properly.

**2. Rejection is recession.** A record that failed the gate sits at `z-recessed`
with 60% saturation and a dashed edge. A record that passed sits at `z-raised`. The
rejection panel then rises *out of* the recessed card when opened. A traveller sees
"most of this page is pushed back, and the four things standing up are the ones I
can actually go to."

**3. The plan recedes into the future.** Stop 1 at `z-lifted`, stop 2 at
`z-raised`, stop 3 at `z-flush`, stop 4 at `z-recessed`. A descending staircase in
depth, reading left to right and near to far. It encodes sequence in the one channel
that is genuinely ordered, and it means the whole plan is legible as a shape before
a word is read. 18px to -10px over four stops is about 9px per step, which is
perceptible without being busy.

**4. Plan integrity is tilt. This is the best idea in the document.**

The validation stamp tilts by an angle proportional to `drift`:

```
tilt = clamp(drift / DRIFT_TOLERANCE, 0, 1) × 6deg,  rotateX
```

At zero drift the plan is **perfectly flat**, because the two independent
derivations agree exactly. As drift approaches the tolerance it visibly **leans**.
Past the tolerance the whole plan is `z-recessed` and refuses to present as valid.

A judge who watches the plan tilt is not reading a number. They are watching the
product lose confidence in itself, in real time, from its own output. **No copy can
do that.** The number still appears in the text, because the tilt is redundant, not
a replacement.

**5. Answer quality is height.** The relaxation ladder is a ladder, visually.

| Rung | Depth |
|---|---|
| `strict` | `z-lifted` |
| `dropped_minimum` | `z-raised` |
| `greedy_fill` | `z-flush` |
| `single_best` | `z-recessed` |

"We settled for one stop" is now visibly lower than "we found exactly what you
asked for". The masterplan says *"Relaxed: minimum 1 stop instead of 2" is a far
better demo than an unsat core."* This is the same sentence, expressed in space.

**6. Hierarchy is elevation.** Top-ranked result at `z-lifted`, the rest at
`z-raised`, hover lifts one step further and adds a 3 degree `rotateX`. Never more
than one card lifted at a time, or nothing is primary.

**7. A sheet pushes the page back.** When a sheet or modal opens, the page content
behind goes to `translateZ(-40px) scale(.96)`. The research names this as the
correct treatment: it *"creates a depth relationship that helps users understand
where they are in the interface."* Do **not** put 3D transforms on the
`position: fixed` sheet itself, because `preserve-3d` and fixed positioning
conflict and you will get a phantom scroll.

---

## 7. Map and progressive enhancement

The map is a 2D geospatial product and stays 2D. A tilted basemap is a navigation
hazard, and MapLibre owns its own render loop.

What depth does on the map, from `components/map.tsx`:
- **Selected pin** lifts to `z-floating` with a shadow that grows with the lift.
- **Cluster badges** get a 5-layer shadow at `z-raised`. A cluster already means
  "a group at one place", so elevation reinforces an existing meaning rather than
  inventing one.
- **Weather desaturates the map**, and `heavy_rain` and `storm` additionally blur
  it, because that is what rain does to distance perception and it makes the
  straight-line-estimate label feel necessary rather than pedantic.
- **A rejected record's pin is recessed** and takes the dashed treatment.

The 3D layer loads **after** first paint and the page is fully usable without it.
The guidance is explicit: *"A beautiful scene that takes 8 seconds to load is still
a failed experience."* No 3D asset may be a render-blocking resource. There are no
3D assets at all, which is the cleanest possible answer.

---

## 8. Tokens, added to `components/ananta/tokens.ts`

Session 1 writes this. Everyone else imports it.

```ts
export const depth = {
  recessed:   "depth-recessed",
  flush:      "depth-flush",
  raised:     "depth-raised",
  lifted:     "depth-lifted",
  floating:   "depth-floating",
  foreground: "depth-foreground",
} as const;

export const depthShadow = {
  recessed:   "shadow-recessed",
  flush:      "shadow-flush",
  raised:     "shadow-raised",
  lifted:     "shadow-lifted",
  floating:   "shadow-floating",
  foreground: "shadow-foreground",
} as const;

/** The seven encodings in section 6, as a lookup so nobody re-derives them. */
export const KNOWLEDGE_DEPTH: Record<Confidence, string> = {
  verified:   depth.raised,
  community:  depth.raised,
  estimate:   depth.flush,
  unverified: depth.recessed,
};

export const RUNG_DEPTH: Record<Rung, string> = {
  strict: depth.lifted, dropped_minimum: depth.raised,
  greedy_fill: depth.flush, single_best: depth.recessed,
};

/** Tilt for the integrity stamp. Max 6deg at the tolerance. */
export const driftTilt = (drift: number, tolerance: number) =>
  `tilt-by-drift-${Math.round(Math.min(1, Math.max(0, drift / tolerance)) * 6)}`;

export const MOTION = { hover: 120, state: 200, scene: 320 } as const;
export const PERSPECTIVE = { min: 900, default: 1200, max: 1400 } as const;
```

`driftTilt` returns a **class name**, not an inline style, so session 1 can ship
seven static rules and nothing computes styles at runtime.

The Tailwind additions session 1 must make: `boxShadow.recessed`, `.raised`,
`.lifted`, `.floating`, `.foreground` mapped to the five-layer stacks, plus
`transformStyle`, `translateZ` and `perspective` utilities if not already implied
by Tailwind 3.4.

---

## 9. RULE 0, unchanged and still first

**You may not implement anything that exists in `lib/engine/`.**

`components/ananta/pipeline.ts` currently contains its own `tokenize`,
`buildIndex`, `retrieve`, `gate`, `wilsonLowerBound`, `objectiveFast`, `pack`,
`objectiveNaive`, `validate` and `relax`. That put the project's two independent
objective derivations in the same file, so the 1e-6 guarantee currently measures a
function against its own neighbour.

| You want | Do this |
|---|---|
| A gate function | `import { gate } from "@/lib/engine"` |
| Score components | `import { objectiveFast, wilsonLowerBound } from "@/lib/engine"` |
| A travel-time lookup | `import { makeTravelOptions, buildStops } from "@/lib/engine"` |
| Something missing | **A blocker entry in `BLOCKERS/<N>.md`** |

Session 1 adds a test that fails the build if any engine export name is also
declared in `app/**` or `components/**`, and a second that fails if
`motion`, `framer-motion`, `three`, `@react-three/fiber` or `gsap` appears in
`package.json` or in any import in the view layer.

---

## 10. Ownership, one file one owner

| # | Session | Owns |
|---|---|---|
| 1 | Foundations | `tailwind.config.ts` · `app/globals.css` · `components/ananta/tokens.ts` · `components/ananta/records.ts` · `lib/ui-guard/**` |
| 2 | Fork removal | `components/ananta/pipeline.ts` · `components/ananta/use-ananta.ts` |
| 3 | Landing and chrome | `app/layout.tsx` · `app/page.tsx` · `app/contact/**` · `components/footer.tsx` · `components/ui.tsx` |
| 4 | Explore | `app/explore/**` · `components/map.tsx` · `components/discovery-search.tsx` · `components/travel-options.tsx` · `components/ananta/explore/**` |
| 5 | Trips | `app/trips/**` · `components/ananta/feasibility-meter.tsx` · `components/ananta/trips/**` |
| 6 | Detail and provenance | `app/experience/**` · `components/ananta/provenance-badge.tsx` · `components/experience-media.tsx` · `components/report-button.tsx` · `components/ananta/provenance/**` |
| 7 | Why this and why not | `components/ananta/why-this.tsx` · `why-this-live.tsx` · `why-not-that.tsx` · `learning.ts` · `plan-button.tsx` · `plan-badge.tsx` · `save-button.tsx` · `share-button.tsx` · `components/ananta/why/**` |
| 8 | Stress and learning | `components/ananta/stress-radar.tsx` · `learned-weights.tsx` · `app/profile/**` · `app/saved/**` · `components/ananta/learning/**` |
| 9 | Disruption | `components/ananta/replan.ts` · `replan-proposal.tsx` · `app/events/**` · `components/availability-picker.tsx` · `components/ananta/replan/**` |
| 10 | Provider and admin | `app/provider/**` · `app/admin/**` · `app/terms/**` · `app/privacy/**` · `components/ananta/provider/**` |

New components go in `components/ananta/<feature>/`, one directory per session.
The 13 existing flat files are each reassigned above. Edit only your own.

Shared-write surface: `BLOCKERS/<N>.md`, append-only, one file per session.

Frozen, nobody edits: `lib/seed.ts` · `lib/engine/**` · `lib/data/**` ·
`package.json` · `next.config.mjs` · `tsconfig.json` · `.eslintrc.json` ·
`vitest.config.ts` · `docs/**`

---

## 11. The quality gate

Run before calling any of this done. All mechanically checkable.

1. `grep -rn "framer-motion\|@react-three\|from \"three\"\|gsap\|from \"motion\"" app/ components/ lib/ package.json` returns nothing.
2. `grep -rn "perspective" app/globals.css` shows a value between 900 and 1400, and no `rotateX` anywhere exceeds 6deg.
3. No animated property other than `transform` or `opacity`. Search for
   `transition-all`, `transition: all`, and any transition naming width, height,
   top, left, or box-shadow.
4. No `@keyframes` ambient loop. The only surviving animation is the route dot.
5. With `prefers-reduced-motion: reduce` emulated, the demo path is fully
   understandable and nothing moves.
6. Every recessed element also desaturates and is dashed. Depth is never the only
   channel.
7. The stress radar has a real `<table>` equivalent in the DOM.
8. Every interactive element shows a 3px focus ring, keyboard-only, top to bottom.
9. 390px and 1440px, no horizontal overflow, no layout shift when the depth layer
   lands.
10. Lighthouse or DevTools shows the main thread idle during every transition, and
    GPU frame time under 16 ms.
11. `git status --short` shows only paths from your ownership row.
12. No em dash, no emoji, no hard-coded dataset number.

Item 10 is the one people skip. If the main thread is doing work during a
transition, the effect is not compositor-only and it will stutter on the mid-range
laptop a judge is using.

---

## 12. The brief

> **Depth encodes what we know, not how big a number is.**

A verified record stands proud. An estimated one sits flush on the surface. An
unverified one is carved into it. A rejected one recedes. The plan steps down into
the distance as it goes forward, and the whole thing tilts if it stops agreeing with
itself.

That is the product thesis rendered in space, and it is worth doing in 3D **because**
3D is the only channel that says *settled* versus *provisional* without a single
word on the screen.
