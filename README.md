# Local Tourist

A free-first, Mumbai and Navi Mumbai discovery prototype: curated local places and events matched to your time, budget, interests, and route. Built to prove a decision engine, not a listings site. The full blueprint lives in `Local-Experiences-Masterplan.md`, and the working documentation lives in `docs/`.

## Stack

- Next.js 14 (App Router), React 18, TypeScript
- MapLibre GL with open OpenFreeMap tiles (replaceable by `NEXT_PUBLIC_MAP_STYLE_URL`)
- Tailwind CSS with the project token palette
- Vitest unit tests
- No backend: demo state persists in `localStorage`; every record carries source, confidence, and last-checked provenance

## Run it

```bash
npm install
npm run dev      # development
npm run build && npm start   # production build
npm test         # unit tests
npx tsc --noEmit # typecheck
```

## Routes

| Route | What it does |
|---|---|
| `/` | Natural-language discovery search with quick prompts |
| `/explore` | Map with clustered markers, zone/city/category/budget/time filters, ranked results with reasons, and exclusion explanations |
| `/events` | Happening Near Me: reference-time event windows with reachability checks and change banners |
| `/experience/[id]` | Detail page with approved external media, feasibility notes, save/plan/report actions |
| `/trips` | Draft plan feasibility (time, travel, buffer, budget, deadline), plan comparison, rain and closure adaptation |
| `/saved` | Locally saved shortlist |
| `/provider` | Provider workspace: submissions, availability control, signal-derived alerts |
| `/admin/operations` | Data review queue: reports, event changes, external media verification, hidden-gem candidates |
| `/privacy`, `/terms` | Legal page drafts pending owner review |

## Product rules this codebase enforces

- Deterministic truth before AI: filtering, feasibility, and availability math run in tested library code; every ranked card and exclusion cites its reasons
- No fabricated claims: demo records are labeled, media is never proof of operational truth, alerts cite their signals
- Changes require confirmation: adaptation flows update the plan only after an explicit action
- Free-first: no paid API in any core flow, and external failures have visible fallbacks

## Documentation map

Start at `docs/README.md`. Quality workflow: `docs/06-quality/ITERATIVE-BROWSER-QA.md` (the loop every slice must pass) and `docs/06-quality/DEMO-SCRIPT.md` (the full seeded demo run). Architectural decisions: `docs/02-planning/DECISION-LOG.md`.
