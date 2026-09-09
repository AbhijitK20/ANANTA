# Demo Script

This is the Sprint 6 demo hardening deliverable: a complete run of the seeded demo with no manual database changes and no paid-service dependency. Every screen in the demo shows demo labels where data is not live. Total demo time: about 8 minutes.

## Before the demo

```bash
npm install
npm run build
npm start        # or: npm run dev
```

Open the printed local URL in a normal browser window. For a clean run, clear site data first so saved places, draft plans, and admin decisions start from the seed state. If the map tile service is unreachable, the map shows its fallback message and the ranked list beside the map continues to work; the demo can proceed without tiles.

## Scene 1 · Ask in natural language (2 minutes)

1. Open the home page.
2. Type into the discovery box: `I have 3 hours near CST and want local food under ₹800`.
3. Submit. The Explore page opens.
4. Point out the applied constraints chip, the ranked matches, and the "Why" line on each card. Open "Why some places were excluded" and read one exclusion reason aloud. The exclusion panel is the honest half of the ranking engine.

## Scene 2 · Judge the map like a local (2 minutes)

1. On Explore, switch the zone filter between two zones and back to All zones.
2. Zoom the map out until markers group into numbered cluster badges. Click one to expand it. Zoom in past the cluster threshold to see markers separate.
3. Select a marker, then select the matching card in the list. The map flies to the selection.
4. Select a weather-dependent record (amber label) and note its label. No screen claims live availability at any point.

## Scene 3 · Build a plan that respects limits (2 minutes)

1. Add two places to the plan from Explore, then open Trips.
2. Set available time to 2 hours and a hard budget of ₹900.
3. Add a return time so the deadline box is filled.
4. Show the feasibility panel: total minutes include activity time plus travel plus a buffer. Explain that a plan that violates a limit is labeled "Needs adjustment" instead of being silently shortened.
5. Open "Compare feasible plans" and show the two listed variants. Apply one explicitly.

## Scene 4 · It rains (1 minute)

1. Add the weather-dependent place (Kharghar Hills View) to the plan.
2. The feasibility panel now warns that one stop is weather dependent. Click "Find an indoor alternative" and inspect the suggested replacement card.
3. Apply the alternative only after showing that the plan changes through an explicit confirmation.

## Scene 5 · The trust loop (2 minutes)

1. Open Events. Use the reference-time buttons. Show the change banner on the changed event with its before/after values, and the excluded-events explanation.
2. On any event, click "Report incorrect information", choose a reason, and send. The dialog closes with Escape as well.
3. Open Provider. Point out the signals panel, then mark a listing closed.
4. Open Trips: the plan now shows the closure card and proposes a replacement that was checked against the remaining time and budget. Apply it explicitly.
5. Open Operations. Show the traveler report, the event change records, the external media queue (approve, reject, stale, with history), and the hidden-gem candidates with safety flags and verification history.
6. Refresh the page. Everything you decided persists on this device.

## Closing line

Every number on screen is a labeled demo record with a source and a last-checked date, and the demo runs entirely on the free-first stack: MapLibre with open tiles, deterministic filtering and feasibility logic, and no paid API in the loop.
