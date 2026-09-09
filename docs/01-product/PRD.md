# Product Requirements Document

## Product

**Local & Experiences** is a free-first local discovery and planning platform for Mumbai and Navi Mumbai. It helps travelers answer:

> What can I realistically experience right now, given my interests, location, time, budget, group, accessibility needs, and current conditions?

The product combines curated geographic data, local experiences, live events, structured constraints, explainable recommendations, and adaptive planning.

## Problem

Local experiences are fragmented across maps, social media, event pages, booking sites, provider websites, and community recommendations. Travelers must manually determine whether an option is open, available, affordable, reachable, suitable, and compatible with the time they have.

Local providers also struggle to reach travelers who are genuinely interested in their offerings.

## Goals

- Help travelers discover relevant places, experiences, and live events in Mumbai and Navi Mumbai.
- Produce feasible recommendations using time, budget, distance, travel mode, opening hours, availability, weather, group, and accessibility constraints.
- Explain why an experience is recommended or excluded.
- Adapt plans when time, weather, availability, budget, or preferences change.
- Give providers a simple way to publish experiences and maintain availability.
- Let travelers preview a place's atmosphere through approved external videos without treating videos as current operational truth.
- Maintain trustworthy data through provenance, freshness, confidence, and human review.
- Deliver the MVP without requiring paid APIs or infrastructure.
- Establish and enforce the design, content, media, and legal contract before screen implementation.

## Non-Goals

- Global or nationwide coverage in the MVP.
- Unlimited automated scraping of social platforms.
- Replacing Google Maps, TripAdvisor, or a full booking marketplace.
- Full public-transit real-time integration in the first release.
- Real payment settlement.
- Native mobile applications before the responsive web experience is proven.
- Autonomous AI booking, cancellation, or safety decisions.

## Launch Geography

The MVP covers curated experiences and events in selected zones.

**Mumbai:** Colaba/Fort, Kala Ghoda, Marine Drive/Girgaon, Bandra, Juhu, Andheri, Powai, Aarey, and Dadar/Matunga.

**Navi Mumbai:** Vashi, Nerul/Seawoods, Belapur, Kharghar, Airoli, and Panvel.

OpenStreetMap may provide broad base-map coverage beyond these zones, but recommendation quality is guaranteed only for curated records in the launch zones.

## Personas

### Traveler

Needs a useful experience within a specific time, budget, location, group, and interest profile.

### Local Provider

Needs to publish an experience, manage availability, receive relevant demand, and understand performance.

### Data Operator or Admin

Needs to verify providers, review sources, resolve duplicates, expire events, and correct inaccurate information.

## Core User Journeys

### Discover Now

1. Traveler selects or shares a location.
2. Traveler enters a natural-language request or chooses constraints.
3. System extracts intent and applies hard filters.
4. System ranks feasible experiences.
5. Traveler sees map, list, route, confidence, and explanations.

### Plan Around a Deadline

1. Traveler enters free time and a final destination or deadline.
2. System calculates activity, travel, waiting, and buffer time.
3. System generates one or more feasible plans.
4. Traveler compares plans by cost, localness, travel, and relaxation.
5. Traveler saves or simulates a booking.

### Find Live Events

1. Traveler opens `Happening Near Me`.
2. System filters events by current time, reachability, category, budget, and weather.
3. Results show start time, travel time, ticket status, source confidence, and freshness.

### Adapt a Plan

1. A traveler or simulated condition changes the plan.
2. System identifies affected items.
3. System regenerates alternatives using current constraints.
4. Traveler reviews tradeoffs and confirms.
5. Itinerary, map route, and booking simulation update.

### Provider Update

1. Provider creates or edits an experience.
2. Admin reviews source and structured details.
3. Provider sets schedule, price, capacity, and availability.
4. Published data becomes available to recommendations.

## Functional Requirements

### Discovery

- `FR-001`: Users can search by keyword, zone, category, and natural language.
- `FR-002`: Users can filter by price, duration, distance, time, availability, audience, accessibility, indoor/outdoor, and authenticity.
- `FR-003`: Users can view experiences on a Mumbai/Navi Mumbai MapLibre map and in a list.
- `FR-004`: The map supports clustering, zone selection, category layers, routes, and nearby transit points.
- `FR-005`: Users can discover events starting soon and reachable within their available time.

### Recommendations

- `FR-006`: The system applies hard constraints before ranking.
- `FR-007`: The system ranks remaining candidates using preferences, context, quality, reliability, freshness, diversity, and provider exposure.
- `FR-008`: Each recommendation explains positive signals and important tradeoffs.
- `FR-009`: The system can explain why a candidate was excluded.
- `FR-010`: The system can produce at least two valid plan variants when alternatives exist.

### Planning

- `FR-011`: Users can provide available time, budget, group, accessibility needs, and deadline.
- `FR-012`: Plans include experience duration, travel time, waiting time, and safety buffer.
- `FR-013`: Plans calculate total cost and distinguish hard from soft budgets.
- `FR-014`: Plans can be added, removed, replaced, reordered, saved, and simulated.
- `FR-015`: Plans can be adapted after weather, availability, time, budget, or preference changes.

### Trust and Data

- `FR-016`: Every published record stores source, confidence, verification, and freshness metadata.
- `FR-017`: Events expire automatically after their end time.
- `FR-018`: Users can report incorrect information.
- `FR-019`: Admins can review duplicates, stale records, hidden-gem candidates, and event changes.
- `FR-020`: The platform does not present unverified social discovery as confirmed availability.
- `FR-025`: Users can view approved external videos attached to an experience, place, or event.
- `FR-026`: Media displays platform, creator attribution, verification state, publish date, and last-checked date where available.
- `FR-027`: The platform stores external media references and metadata, not downloaded or re-hosted videos.
- `FR-028`: Unavailable, private, deleted, stale, or rejected media is not shown as active.

### Provider and Admin

- `FR-021`: Providers can create experiences with structured operational fields.
- `FR-022`: Providers can update availability, capacity, hours, and price.
- `FR-023`: Admins can approve, reject, suspend, and verify providers and listings.
- `FR-024`: Admins can inspect a data-operations queue.

## Non-Functional Requirements

- **Cost:** Core demo works without paid APIs.
- **Performance:** Cached discovery results render quickly; external failures do not block the whole page.
- **Reliability:** AI cannot override authoritative availability, price, schedule, or booking state.
- **Accessibility:** Responsive UI, keyboard navigation, readable contrast, accessible forms, and map list alternatives.
- **Privacy:** Location is permission-based; precise history is minimized.
- **Auditability:** Source and verification changes are traceable.
- **Media compliance:** External media respects embedding, attribution, copyright, privacy, and platform usage requirements.
- **Design consistency:** All screens follow the approved design contract and content style guide.
- **Truthfulness:** No fabricated reviews, metrics, imagery, copy, availability, or testimonials.
- **Security:** Role-based authorization, validation, rate limiting, secure sessions, and secret management.

## Success Metrics

- Useful recommendation shown within the first session.
- At least 80% of demo recommendation plans satisfy hard constraints.
- 100% of published demo events have source and expiry metadata.
- A traveler can create a valid plan in under three minutes.
- A disruption can produce a reviewed alternative in under one minute.
- Providers can publish or update an experience without admin database access.
- North-star metric: successful local experiences per active traveler.

## Assumptions and Risks

- Seed data will be curated manually before automated ingestion is mature.
- Free public endpoints have quotas and usage policies.
- Social content can become stale quickly and requires confirmation.
- Travel-time estimates may be approximate without live traffic or transit feeds.
- Hidden gems require verification and should not be equated with low popularity.

## Release Acceptance

The MVP is acceptable when one complete flow works end to end:

```text
Traveler request
→ Mumbai/Navi Mumbai discovery
→ Constraint filtering
→ Explainable recommendations
→ Feasible plan
→ Live event or disruption change
→ Validated alternative
→ Traveler confirmation
```
