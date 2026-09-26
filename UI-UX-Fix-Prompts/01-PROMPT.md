# SESSION 1 of 10 — Foundations: Depth Tokens, Occlusion, and the Guards

> Copy everything below this line into a new session.

---

You are session 1 of 10 in the **spatial UI round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

**You go first and nine sessions are blocked on you.** The current UI has **zero 3D
primitives**: no `perspective`, no `translateZ`, no `preserve-3d`, and every shadow
in the app is a single flat layer, which is why it reads as basic. You build the
entire depth substrate in this session.

Budget about 45 minutes. You are the critical path and that is fine.

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**. Section 3 is the shadow
   system, section 4 the motion tokens, section 6 the seven encodings, section 8
   the exports, section 11 the quality gate. This file is the whole job.
2. `SESSION/UI-UX-DESIGN.md` sections 2, 3 and 4 for the honesty grammar the depth
   is encoding.
3. `app/globals.css` (183 lines, currently flat) and `tailwind.config.ts` (28 lines).
4. `docs/05-design/DESIGN-CONTRACT.md` lines 13 to 30. Read this and understand why
   section 0 of the contracts reconciles with it, because a judge may challenge it.

## ALLOWED — you own these, exclusively

```
tailwind.config.ts
app/globals.css
components/ananta/tokens.ts
components/ananta/records.ts
lib/ui-guard/**
UI-UX-Fix-Prompts/BLOCKERS/1.md
```

## FORBIDDEN

```
components/ananta/pipeline.ts, use-ananta.ts                     session 2
app/layout.tsx, app/page.tsx, app/contact/**, footer.tsx, ui.tsx   session 3
app/explore/**, map.tsx, discovery-search.tsx, travel-options.tsx session 4
app/trips/**, components/ananta/feasibility-meter.tsx             session 5
app/experience/**, provenance-badge.tsx, experience-media.tsx, report-button.tsx  session 6
components/ananta/why-this.tsx, why-this-live.tsx, why-not-that.tsx, learning.ts,
  plan-button.tsx, plan-badge.tsx, save-button.tsx, share-button.tsx  session 7
components/ananta/stress-radar.tsx, learned-weights.tsx,
  app/profile/**, app/saved/**                                    session 8
components/ananta/replan.ts, replan-proposal.tsx,
  app/events/**, availability-picker.tsx                           session 9
app/provider/**, app/admin/**, app/terms/**, app/privacy/**        session 10
lib/**  FROZEN, including lib/engine and lib/data
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, vitest.config.ts, docs/**
```

## Task, in this order

### 1. `app/globals.css` — the depth substrate. This is the deliverable.

Add the five-layer ambient occlusion stacks from contracts section 3, verbatim.
Offset and blur rise together while alpha falls; that gradient is what produces the
occlusion read rather than a sticker look. Light from the top-left throughout.

**`--shadow-inset` matters as much as the raised stacks.** An inset shadow on a
recessed element is what makes "we do not know this" look *carved* rather than
merely grey. It is the most important shadow in the product.

Then add the depth classes. One class per step, each a `transform` plus its shadow:

```css
.stage { perspective: 1200px; }   /* the 3D container */
.depth-recessed  { transform: translateZ(-10px); box-shadow: var(--shadow-inset); filter: saturate(.6); }
.depth-flush     { transform: translateZ(0);     box-shadow: var(--shadow-flush); }
.depth-raised    { transform: translateZ(8px);   box-shadow: var(--shadow-raised); }
.depth-lifted    { transform: translateZ(18px);  box-shadow: var(--shadow-lifted); }
.depth-floating  { transform: translateZ(32px);  box-shadow: var(--shadow-floating); }
.depth-foreground{ transform: translateZ(48px);  box-shadow: var(--shadow-foreground); }
```

Constraints that are not negotiable:

- **Perspective between 900 and 1400.** The research gives the band and the reason:
  below 600 is cartoonish, above 2000 is imperceptible. Default 1200.
- **Desaturation on `recessed` only.** A person who cannot perceive depth must
  still read the same information, so depth is the primary channel and
  desaturation plus the dashed border are the redundant ones. Depth is never the
  only channel.
- **`preserve-3d` on `.stage` only.** It creates a stacking context and breaks
  `position: fixed` descendants. If you find yourself wanting it on a card, the
  answer is a nested `.stage`, not `preserve-3d` on the card.
- **Never transition `box-shadow`.** Set it per depth step via a custom property.
  Animating a five-layer stack repaints on every frame.
- **Never transition anything except `transform` and `opacity`.** A
  `transition: all` anywhere in this file is a failure.

Add the **seven tilt classes** for the integrity stamp, as static rules:

```css
.tilt-by-drift-0 { transform: rotateX(0deg); }
/* ... through */
.tilt-by-drift-6 { transform: rotateX(6deg); }
```

Six degrees is the ceiling and the research is why: a card that stays tilted reads
as broken. `driftTilt()` in `tokens.ts` selects the class, so **nothing computes a
style at runtime.**

Add the motion tokens from section 4, and a `.lift` hover helper that raises one
step and adds at most `rotateX(3deg)`.

**Keep everything that already exists.** The `:focus-visible` ring at `:152-167` is
ratified and eight sessions depend on it. The `.sr-only` at `:168`, the skip link
at `:133`, `.place-pin` at `:66-76` and the reduced-motion block at `:128-131` all
stay. **Do not add a second focus rule.** The travelling route dot at `:112-126`
stays, because a directional indicator is information rather than decoration, and
it is already reduced-motion guarded.

Then **rewrite the reduced-motion block** per contracts section 5. The blanket reset
kills the animation but must **not** kill meaning: verified stays green, unverified
stays dashed and desaturated, a rejection stays amber, a drifted plan stays
flagged. Depth and motion are redundant encodings, so dropping one leaves the other
intact. That is what makes this accessible rather than merely decorated.

Finally, add `.card`, `.chip`, `.prose-note`, `.hairline`, and the `depth-*` and
`tilt-*` families, so nine sessions do not each write their own Tailwind string.

### 2. `components/ananta/tokens.ts` — the shared vocabulary

Transcribe **contracts section 8** exactly: `depth`, `depthShadow`, `KNOWLEDGE_DEPTH`,
`RUNG_DEPTH`, `driftTilt`, `MOTION`, `PERSPECTIVE`.

Also keep everything from the previous round that nine sessions already import:
`typeScale`, `space`, `radius`, `motion`, `layer`, `PROVENANCE_TONE`,
`CONFIDENCE_TONE`, `MIXED_TONE`, `mixedChip`, `KNOWLEDGE_LEGEND`, `UI_STATE_COPY`
with all nine states, `FIELD_LABEL`, `COMPONENT_LABEL`, `TONE_TEXT`.

**`CONFIDENCE_TONE` is currently defined twice**, in
`components/ananta/provenance-badge.tsx` and again in
`components/ananta/why-not-that.tsx:16-21`. Session 1 owns the canonical copy. The
other two sessions will import it. Do not go and edit their files.

Add the seven-step `typeScale` on the same pattern as before, and add a
`credibilityLine()` re-export from `records.ts` so no session hard-codes a dataset
number.

### 3. `tailwind.config.ts` — map the stacks

Add `boxShadow.recessed`, `.flush`, `.raised`, `.lifted`, `.floating`,
`.foreground` from section 3. Add the seven-step `fontSize`. Add `zIndex` for
sticky, dropdown, popup, sheet, skip. Add `transitionDuration` of 120 and 200 only.

Keep the existing colour tokens. They satisfy
`docs/05-design/DESIGN-CONTRACT.md:32-35` and are ratified.

### 4. `lib/ui-guard/` — the four tests that keep the other nine honest

**`spatial-primitives.test.ts`** — the rules that make this design disciplined
rather than decorative. All mechanically checkable:

- No `framer-motion`, `motion`, `three`, `@react-three/fiber`, `@react-three/drei`,
  `gsap` or `lenis` in any import under `app/` or `components/`, and none in
  `package.json`. The whole spatial layer is CSS, and installing a 34 to 45 kB
  animation library to tilt a card breaks a stated non-negotiable.
- Every `perspective` value in the codebase is between 900 and 1400.
- No `rotateX`, `rotateY` or `rotateZ` magnitude exceeds 6 degrees.
- No `transition: all` and no `transition-all`. No transition naming `width`,
  `height`, `top`, `left`, `right`, `margin`, `padding` or `box-shadow`.
- No `@keyframes` that loops ambiently. The only surviving animation must be the
  route dot.
- Every `.depth-recessed` rule includes a `saturate` filter, so depth is never the
  only channel.

**`reduced-motion.test.ts`** — assert the `prefers-reduced-motion` block still
exists, still neutralises `transform` on all six depth classes and all seven tilt
classes, and that the state colours it depends on are not inside the block. A
reduced-motion fallback that also greys out the verified state has destroyed the
meaning, not just the motion.

**`no-engine-fork.test.ts`** — the same test as the previous round, and it is the
reason session 2 has a job. `components/ananta/pipeline.ts` declares its own
`tokenize`, `buildIndex`, `retrieve`, `gate`, `wilsonLowerBound`, `objectiveFast`,
`pack`, `objectiveNaive`, `validate` and `relax`. That put the two independent
objective derivations in one file, so the 1e-6 guarantee measures a function
against its own neighbour, and it hid a whole engine copy outside the boundary
`lib/engine/guard/no-model.test.ts` inspects. Read the engine's export names, walk
`app/**` and `components/**`, fail on any collision. **Include a positive control**
so the guard is provably capable of failing. **Make it a skipped-until-present
exception for `pipeline.ts` only, live for every other file from the first run.**

**`hardcoded-numbers.test.ts`** — no bare dataset literal (`1107`, `1104`, `391`,
`43`, `1,107`) anywhere in `app/` or `components/`. `records.ts` is the only
permitted source. Cheap, and it is the difference between a credible number and one
that rots.

Also fold in `no-legacy-copy.test.ts` from the previous round: U+2014, emoji in the
`U+1F300` to `U+1FAFF` range, and the four fabricated claims this codebase shipped,
including a `2:15 PM`-style clock template and `Math.max(counts`. Report, do not
auto-fix; those files belong to sessions 5, 7, 9 and 10.

## Constraints

- **Zero new dependencies.** Not for motion, not for 3D, not for icons.
- No em dash (U+2014), no emoji, in anything including tests and comments.
- Do not edit a file you do not own. Nine people are in this tree.
- If the engine lacks something, it is a blocker, not a local copy.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib/ui-guard
npm run dev
```

Then open a scratch page and **measure it**, because a spatial design that has not
been measured is a guess. In DevTools: confirm the main thread is idle during a
hover transition, confirm GPU frame time is under 16 ms, and confirm the five-layer
shadow actually reads as elevation rather than as a smudge.

## Definition of done

1. The five-layer occlusion stacks are in, with the inset recession shadow.
2. Six depth classes plus seven tilt classes, perspective 900 to 1400, no rotateX
   above 6 degrees.
3. The reduced-motion block neutralises motion and **preserves every state colour
   and every dashed border**.
4. `tokens.ts` has section 8's exports plus everything the previous round defined.
5. `tailwind.config.ts` maps the stacks and the type scale.
6. `spatial-primitives.test.ts` passes and has a positive control.
7. `reduced-motion.test.ts` passes.
8. `no-engine-fork.test.ts` passes, live for everything except `pipeline.ts`.
9. `hardcoded-numbers.test.ts` passes.
10. `git status --short` shows only your five path patterns.
11. Your summary reports the measured frame time and main-thread state, and how many
    ad-hoc flat shadows you found in files you do not own so sessions 3 to 10 can
    pick them up.
