# Technical Architecture

## Architecture Style

Start with a modular monolith. Keep domain boundaries explicit so heavy workloads can be extracted later without premature microservices.

```text
Responsive Web Client
        ↓
API Layer
        ↓
Identity | Traveler | Experience | Search | Recommendation
Itinerary | Availability | Booking | Events | Provider | Admin
        ↓
PostgreSQL + Cache + Source Records
        ↓
Map / Routing / Weather Adapters
```

## Three Intelligence Layers

### Understanding

Natural-language intent, preferences, mood, group context, explanations, review summaries, and provider listing assistance.

### Truth

Published experience records, source metadata, prices, opening hours, availability, capacity, bookings, event state, permissions, and audit history.

### Decision

Candidate generation, hard filtering, scoring, feasibility, itinerary optimization, plan comparison, and adaptive replanning.

## Request Flow

```text
User Request
→ Intent Extraction
→ Structured Constraints
→ Candidate Query
→ Hard Constraint Filter
→ Travel-Time Enrichment
→ Ranking and Diversity
→ Feasibility Validation
→ Explanation
→ UI Result
```

The LLM never writes operational facts directly. It can propose structured intent, but the backend validates the result.

## Modules

- **Identity:** authentication, sessions, roles, permissions.
- **Traveler:** profiles, preferences, temporary context, groups.
- **Experience:** places, providers, categories, tags, suitability.
- **Search:** keyword, filters, zones, viewport, transit radius.
- **Recommendation:** candidate generation, scoring, explanations.
- **Itinerary:** plans, items, travel segments, deadlines, comparison.
- **Availability:** hours, slots, capacity, closures, freshness.
- **Booking:** booking simulation and state transitions.
- **Events:** ingestion, deduplication, confidence, expiry, change detection.
- **Media:** external video references, place/event matching, embed fallback, verification, link health, and attribution.
- **Provider:** submissions, availability, bookings, demand signals.
- **Admin:** moderation, data operations, verification, reports.
- **Notifications:** plan changes, event changes, provider updates.
- **Analytics:** product events and provider metrics.

## Free-First Adapters

Use interfaces for every external dependency:

- `MapTileProvider`
- `Geocoder`
- `RouteProvider`
- `WeatherProvider`
- `EventSourceConnector`
- `MediaMetadataProvider`
- `IntentParser`
- `EmbeddingProvider`

Each adapter must support a cached or deterministic fallback. The application should not call a paid provider directly from UI code.

## Caching

Cache:

- Map and route results
- Geocoding
- Nearby discovery queries
- Stable provider and category data
- Parsed event source results
- Approved media metadata and link-health checks
- AI explanations where inputs and source versions match

Do not blindly cache:

- Booking state
- Remaining capacity
- Provider-confirmed availability
- Security or permission decisions

## Resilience

| Failure | Fallback |
|---|---|
| AI unavailable | Structured search and tag-based ranking |
| Routing unavailable | Cached estimate or distance-only warning |
| Weather unavailable | Normal recommendation mode |
| Event source unavailable | Last verified record with freshness warning |
| Map tiles unavailable | List view and textual locations |
| Availability unavailable | Mark `Needs confirmation`; do not claim availability |
| Video embed unavailable | Show thumbnail and `Open on platform` link |

## Security Boundaries

- Validate every user and provider input.
- Enforce role authorization server-side.
- Keep secrets in environment configuration.
- Rate-limit public search and reports.
- Audit provider, admin, booking, and moderation changes.
- Do not expose private source credentials or raw personal data.
