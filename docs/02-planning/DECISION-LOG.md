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
