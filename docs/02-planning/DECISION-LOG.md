# Decision Log

## DEC-001: Launch Geography

**Decision:** Start with selected zones in Mumbai and Navi Mumbai.

**Reason:** Smaller geography enables curated, fresher data and a convincing demo.

## DEC-002: Free-First Map

**Decision:** Use MapLibre with OpenStreetMap-based data and a permitted free/low-cost tile source.

**Reason:** Avoid paid map SDK dependency and retain replaceable adapters.

## DEC-003: Curated Database as Truth

**Decision:** External sources discover and enrich records; the internal database controls published price, hours, availability, event status, and recommendation facts.

**Reason:** Social and public sources are useful but unstable and may be stale.

## DEC-004: Deterministic Constraints Before AI

**Decision:** Apply hard constraints and calculations in backend logic before using AI for explanation or intent interpretation.

**Reason:** LLM output must not decide operational truth.

## DEC-005: Modular Monolith

**Decision:** Start as a modular monolith.

**Reason:** Lower cost and complexity while preserving clear domain boundaries.

## DEC-006: No Unlimited Social Scraping

**Decision:** Use provider submissions, official APIs where available, manual review, and source links for social discovery.

**Reason:** Reduces legal, licensing, reliability, and maintenance risk.

## DEC-007: Approved Project Tool Collection

**Decision:** Use Hallmark, Playwright CLI, Supabase, Public APIs, Awesome Design MD, MapLibre GL JS, PMTiles, OSRM, Tippecanoe, and Playwright MCP as approved project tools or references according to `docs/03-technical/PROJECT-TOOLS.md`.

**Reason:** These tools directly support design quality, browser QA, free-first maps, routing, data work, and database infrastructure without requiring autonomous agents or unrestricted scraping.

## DEC-008: Iterative Browser Verification

**Decision:** Every implementation slice must be built, browsed locally, tested through its user flow, checked at mobile and desktop viewports, and reverified after fixes.

**Reason:** Compilation does not reveal layout failures, map issues, stale interactions, browser errors, or violations of the design and truth contracts.

## DEC-009: Deterministic Client-Side Marker Clustering

**Decision:** Cluster map markers with a pure grid function (`lib/cluster.ts`) keyed by zoom band instead of a clustering dependency or server-side tiling.

**Reason:** The prototype dataset is small and bounded. A deterministic grid keeps the map legible at city zoom, costs no extra dependency, is fully unit-testable, and any future vector-tile clustering can replace it behind the same component interface.

## DEC-010: Store-Owned Media Verification

**Decision:** Experience pages render only media that is Approved in the admin media store (`lib/media-store.ts`), not whatever the seed says.

**Reason:** The media policy requires that verification state, not editorial intent, controls publication. Making the traveler-facing page read from the same store the admin edits keeps the review loop honest end to end.

## DEC-011: Reference-Relative Event Times

**Decision:** Event seed times stay minutes-relative to the demo reference time, and change labels describe those minutes rather than wall-clock times.

**Reason:** Wall-clock labels would fabricate a date the demo does not have. Relative minutes keep every displayed value traceable to the seed record.

## DEC-012: Provider Alerts From Recorded Signals Only

**Decision:** Provider alerts are derived deterministically from update age, availability state, and saves recorded in demo storage. No alert is invented from trends the prototype does not track.

**Reason:** Alert copy that cites its signal preserves the truth contract; a plausible-sounding but untracked trend would be a fabricated claim.

## DEC-013: Product Name Is Ananta

**Decision:** The product is renamed to Ananta everywhere: user-facing copy, metadata, package name, and internal storage keys and event names (`ananta-*`).

**Reason:** A single name across visible and internal surfaces prevents drift and keeps the demo coherent. Old `local-tourist-*` keys are dropped rather than migrated because all state is device-local demo data.

## DEC-014: Fixed Demo Location With Estimate-Only Distances

**Decision:** The traveler position is a single static record in `lib/location.ts` (Churchgate station), labeled as a fixed demo location on every surface. Distances are haversine plus a 1.3 street factor expressed as walk minutes, and proximity contributes a small, cited scoring bonus.

**Reason:** Geolocation would fake a capability the prototype cannot back, while a static point still makes near-versus-far reasoning visible. Estimates are labeled as estimates and never presented as routes; routing remains future work.

## DEC-015: External Media Verified Against Source Before Seeding

**Decision:** Every seeded video is checked against its live platform source before entering the demo, with the real title and creator recorded. Images come from Wikimedia Commons and always render with a photographer credit and an area-photo label.

**Reason:** A video that does not exist or does not show the place is a fabricated claim of exactly the kind the truth contract forbids. Credits keep the free-media licensing honest, and the area-photo label stops an atmosphere image from implying a venue claim.

## DEC-016: Real Street Routing With a Labeled Estimate Fallback

**Decision:** Walking directions are fetched from the open OSRM servers (OpenStreetMap data, no key) and drawn on the map as a street-following polyline with a turn-by-turn panel. If routing is unreachable, the app draws a straight-line line in a muted color and labels it as an estimate instead of pretending it is a street route. The moving dot follows the actual path geometry. Route data is attributed to OpenStreetMap contributors.

**Reason:** A straight line drawn over streets would silently mislead, which is worse than a visible estimate. Open routers keep the free-first rule intact.

## DEC-018: Grouped Filter Stack and Multi-Mode Travel Comparison

**Decision:** The Explore filter overlay is a grouped, stacked panel (Where, What, Budget and time, When, Vibe) instead of two flat chip rows; it is open by default on desktop, collapsed on mobile, and exposes budget and time-available controls that were previously only reachable through search text. Detail pages gain an About section derived strictly from fields the record already has, plus a travel-options panel that fetches real foot, bike, and car OSRM profiles in parallel, marks the fastest, and falls back to per-mode straight-line estimates when routing is unreachable. The Discover page adds browse chips that deep-link into Explore query params (gems, free, walkable, bestTime, city).

**Reason:** Flat chip rows hid capabilities and crowded the map on small screens; travelers compare travel modes when deciding, and OSRM's free profiles make honest comparison possible without a paid service. Every mode and About line still cites its provenance per the truth contract.

## DEC-017: Snapped Coordinates and Varied Editorial Status

**Decision:** Every record coordinate is snapped to the OSM street network (verified with the router nearest endpoint), including the fixed demo position, which now sits on the Marine Drive promenade instead of in the water. Record status uses a varied vocabulary (Verified record, Curated record, Community sourced, Awaiting operator check, Seasonally reachable, Weather dependent) that reflects each record's actual editorial state instead of one blanket demo tag.

**Reason:** A pin in the sea or mid-block breaks routing and credibility, and a single repeated status label carries no information and misstates records that came from residents or were verified.

## DEC-019: Name-List Dataset With Deterministic Factory and Verified Media Pools

**Decision:** The catalog scales to 1,100+ records (at least 100 per category across Food, Nightlife, Shopping, Adventure, Recreation, Stay, Culture, Nature, Workshop, and Family) without hand-writing every record. Category data files hold only the parts that must be real and hand-checked — real venue names grouped under their real area from `lib/data/zones.ts`. Everything per-record and mechanical (pin jitter, demo price and duration bands, travel time) is derived deterministically in `lib/data/factory.ts` and labeled as a demo estimate. Photos come from a Commons pool verified at generation time (`scripts/verify-media.mjs`), and every record receives exactly one oEmbed-verified YouTube video so no detail page is without source-checked media. Coverage tests in `lib/data/dataset.test.ts` enforce per-category minimums, unique ids, bounding-box pins, and one approved embeddable video per place.

**Reason:** Hand-writing thousands of full records was not maintainable, but fabricating venue names or unverifiable media would break the truth contract. Splitting hand-data (existence, area) from derived data (demo estimates) keeps the scale honest: every place is real and correctly located, every derived value admits it is an estimate, and nothing unverifiable enters the media pools.
