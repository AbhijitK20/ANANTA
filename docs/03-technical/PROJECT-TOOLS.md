# Project Tools and Plugin Registry

## Purpose

This registry defines the local tools, plugins, and reference repositories approved for Local & Experiences. It is the source of truth for which resources should be used consistently during design, implementation, data work, and QA.

The collection lives in `/home/abhijitk20/plugins`. Repositories in that folder are references or tools, not automatic runtime dependencies. A repository must be intentionally added to the application dependency graph before application code imports it.

## Non-Negotiable Project Rules

- User-approved design rules override plugin defaults.
- No purple gradients, pill-shaped buttons, emoji icons, cursor animations, fake metrics, fake reviews, fake counters, AI slop imagery, AI slop copy, vague claims, or excessive scroll animation.
- No external tool may invent prices, availability, events, reviews, metrics, or location facts.
- No scraper may be used against a source without a source-specific terms, privacy, copyright, and rate-limit review.
- Open-source repository code must not be copied into the product without checking its license and preserving required notices.
- Keep local clones as references unless the implementation explicitly needs a package, binary, Docker image, or documented command.

## Approved Existing Plugins

### Hallmark

**Path:** `/home/abhijitk20/plugins/hallmark`

**Use consistently for:** design audits, anti-AI-slop review, typography, color discipline, responsive behavior, interaction states, copy, imagery, and motion review.

**Project-specific override:** Do not use its pill, cursor-magnet, perpetual-animation, purple-gradient, glassmorphism, or decorative-motion patterns when they conflict with the project design contract.

### Playwright CLI

**Path:** `/home/abhijitk20/plugins/playwright-cli`

**Use consistently for:** browser QA, mobile and desktop viewport checks, screenshots, keyboard checks, map interactions, broken media links, legal-page links, and end-to-end flows.

### Supabase

**Path:** `/home/abhijitk20/plugins/supabase`

**Use as:** PostgreSQL, authentication, storage, row-level-security, and local-development reference. Use only the services the MVP needs.

### Public APIs

**Path:** `/home/abhijitk20/plugins/public-apis`

**Use as:** a discovery index for free weather, event, geocoding, transport, and public-data sources. Every candidate API needs an individual quota, terms, attribution, reliability, and freshness review.

### Awesome Design MD

**Path:** `/home/abhijitk20/plugins/awesome-design-md`

**Use as:** design-system research and information-hierarchy reference. Do not clone another product's visual identity.

## Approved New Reference Repositories

### MapLibre GL JS

**Path:** `/home/abhijitk20/plugins/maplibre-gl-js`

**Repository:** `https://github.com/maplibre/maplibre-gl-js`

**Use:** browser map rendering, vector tiles, markers, layers, route display, and map interaction research.

**License:** BSD 3-Clause, verified from `LICENSE.txt`.

**Pinned reference commit:** `54dfab1e186e72fc43bc319cab97c5427f80a0f3`.

**Runtime policy:** Prefer the published package in the application. Do not copy the full repository into the application.

### PMTiles

**Path:** `/home/abhijitk20/plugins/PMTiles`

**Repository:** `https://github.com/protomaps/PMTiles`

**Use:** future low-cost static vector-tile archives and serverless map delivery. This is the preferred path if public tile quotas become a problem.

**License:** BSD 3-Clause for reference implementations; the specification is public domain or CC0 where applicable. Sample tilesets have separate terms.

**Pinned reference commit:** `182d5b3cfdc2f5a6adbc54630c612da2f6086bdd`.

**Runtime policy:** Not required for Sprint 1. Keep as a map-cost and self-hosting option.

### OSRM Backend

**Path:** `/home/abhijitk20/plugins/osrm-backend`

**Repository:** `https://github.com/Project-OSRM/osrm-backend`

**Use:** self-hosted OpenStreetMap-based routing for walking/driving route experiments, distance, duration, and itinerary feasibility.

**License:** BSD 2-Clause, verified from `LICENSE.TXT`.

**Pinned reference commit:** `31df8cd1a13b5671caf51b59b74a24f7dced9715`.

**Runtime policy:** Start with a cached adapter or permitted demo endpoint. Self-host OSRM only when route volume or reliability requires it.

### Tippecanoe

**Path:** `/home/abhijitk20/plugins/tippecanoe`

**Repository:** `https://github.com/felt/tippecanoe`

**Use:** convert curated Mumbai/Navi Mumbai GeoJSON data into vector tiles or PMTiles-compatible tile inputs.

**License:** BSD 2-Clause, verified from `LICENSE.md`.

**Pinned reference commit:** `4f2621186acfec33b63ddf636f665623c0fef2dd`.

**Runtime policy:** Data-pipeline and map-build tool only. Do not add it to the web bundle.

### Playwright MCP

**Path:** `/home/abhijitk20/plugins/playwright-mcp`

**Repository:** `https://github.com/microsoft/playwright-mcp`

**Use:** optional local MCP browser QA for structured accessibility snapshots, deterministic interaction, screenshots, network mocking, and regression checks.

**License:** Apache 2.0, verified from `LICENSE`.

**Pinned reference commit:** `8a13ef8e9f7385a0f89477922127f31cbfde9761`.

**Runtime policy:** Development and QA only. Never expose an unrestricted browser-control MCP server in production.

## Deferred or Not Approved by Default

- Scraping tools such as Scrapling and crawl4ai: only after source-specific compliance review.
- Autonomous agent frameworks such as AutoGPT, MetaGPT, CrewAI, LangGraph, and DSPy: not needed for the deterministic MVP recommendation flow.
- Generic SaaS starters and landing-page collections: not the product foundation.
- Motion-heavy taste defaults: conflict with the design contract.
- Coolify: useful later for self-hosting, not needed for initial development.
- SEO and documentation tools: add only after the product information architecture stabilizes.

## Selection Process for Future Tools

Before cloning or using a new repository:

1. Define the concrete project problem it solves.
2. Verify maintenance activity and documentation.
3. Verify license and redistribution requirements.
4. Check dependencies, build cost, and local resource usage.
5. Check whether it supports the free-first architecture.
6. Check privacy, security, data-source, and platform-policy implications.
7. Clone it into `/home/abhijitk20/plugins` if it is useful as a reference.
8. Add it to this registry with its role, license, version/commit, and runtime policy.
9. Add it to the application only through an explicit dependency or documented tool command.

## Update Policy

Do not silently replace the selected stack because a new plugin looks attractive. Record material changes in `docs/02-planning/DECISION-LOG.md`, update this registry, and verify the project still satisfies the design contract, free-first constraint, and data-governance rules.
