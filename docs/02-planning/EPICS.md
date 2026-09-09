# Epics and Feature Map

## Delivery Approach

Use lightweight Scrum with Kanban execution. Each epic should produce a usable vertical slice, not an isolated technical layer.

## Epic List

| ID | Epic | Outcome | Priority |
|---|---|---|---|
| EP-01 | Foundation | App, roles, database, deployment, and design baseline | P0 |
| EP-02 | Geographic Map | Useful Mumbai/Navi Mumbai map and route surface | P0 |
| EP-03 | Experience Data | Structured, curated, provenance-aware records | P0 |
| EP-04 | Data Operations | Verification, freshness, duplicates, and reports | P0 |
| EP-05 | Traveler Discovery | Search, filters, intent, and nearby discovery | P0 |
| EP-06 | Recommendation Engine | Feasible, explainable, personalized ranking | P0 |
| EP-07 | Planning | Time, budget, deadline, and plan comparison | P0 |
| EP-08 | Adaptive Planning | Alternatives when reality changes | P0 |
| EP-09 | Live Events | Temporary event discovery and expiry | P0 |
| EP-10 | Provider Platform | Provider listing and availability management | P1 |
| EP-11 | Trust and Safety | Reviews, suitability, confidence, and reporting | P1 |
| EP-12 | Demo Hardening | Testing, responsive polish, fallback behavior, and presentation | P0 |

## Feature Map

### EP-01 Foundation

- `FEAT-001` Repository and environment setup
- `FEAT-002` Authentication and role model
- `FEAT-003` Responsive application shell
- `FEAT-004` PostgreSQL schema and migrations
- `FEAT-005` Basic deployment and environment documentation

### EP-02 Geographic Map

- `FEAT-010` MapLibre integration
- `FEAT-011` Mumbai/Navi Mumbai zone boundaries
- `FEAT-012` Experience markers and clustering
- `FEAT-013` Category layers and map/list synchronization
- `FEAT-014` Route and travel-time display
- `FEAT-015` Transit points and nearby-station discovery

### EP-03 Experience Data

- `FEAT-020` Experience and place schema
- `FEAT-021` Provider schema
- `FEAT-022` Category, tag, and suitability model
- `FEAT-023` Seed dataset import
- `FEAT-024` Source provenance and freshness
- `FEAT-025` Event schema and seed import
- `FEAT-026` Verified external media references

### EP-04 Data Operations

- `FEAT-030` Admin review queue
- `FEAT-031` Provider and listing verification
- `FEAT-032` Duplicate detection and merge workflow
- `FEAT-033` Stale record detection
- `FEAT-034` Incorrect-information reports
- `FEAT-035` Hidden-gem candidate review
- `FEAT-036` Event change and expiry workflow
- `FEAT-037` Media verification and link health

### EP-05 Traveler Discovery

- `FEAT-040` Traveler profile and preferences
- `FEAT-041` Keyword and structured search
- `FEAT-042` Natural-language intent extraction
- `FEAT-043` Hard filters
- `FEAT-044` Mood and context input
- `FEAT-045` `What Can I Experience Right Now?`
- `FEAT-046` `Happening Near Me`
- `FEAT-047` `See It Before You Go` media section

### EP-06 Recommendation Engine

- `FEAT-050` Candidate generation
- `FEAT-051` Constraint filtering
- `FEAT-052` Ranking and scoring
- `FEAT-053` Feasibility and confidence score
- `FEAT-054` Recommendation explanations
- `FEAT-055` Exclusion explanations
- `FEAT-056` Diversity and hidden-gem signals
- `FEAT-057` Provider reliability signal

### EP-07 Planning

- `FEAT-060` Available-time planning
- `FEAT-061` Deadline-aware planning
- `FEAT-062` Budget calculation
- `FEAT-063` Travel and buffer calculation
- `FEAT-064` Itinerary generation and editing
- `FEAT-065` Plan comparison
- `FEAT-066` Experience bundles
- `FEAT-067` Save/share/booking simulation

### EP-08 Adaptive Planning

- `FEAT-070` Affected-item detection
- `FEAT-071` Alternative generation
- `FEAT-072` Weather/rain scenario
- `FEAT-073` Reduced-time scenario
- `FEAT-074` Unavailable-experience scenario
- `FEAT-075` Confirmation and change history

### EP-09 Live Events

- `FEAT-080` Event source and confidence labels
- `FEAT-081` Event deduplication
- `FEAT-082` Event reachability filtering
- `FEAT-083` Event expiry
- `FEAT-084` Event change detection

### EP-10 Provider Platform

- `FEAT-090` Provider registration
- `FEAT-091` Provider listing creation
- `FEAT-092` Availability and capacity management
- `FEAT-093` Provider booking view
- `FEAT-094` Provider demand alerts

### EP-11 Trust and Safety

- `FEAT-100` Reviews and completion feedback
- `FEAT-101` Review summaries
- `FEAT-102` Field-level confidence display
- `FEAT-103` Accessibility and suitability display
- `FEAT-104` Safety and contact information
- `FEAT-105` Incorrect-data reporting
- `FEAT-106` Broken-media reporting and attribution

### EP-12 Demo Hardening

- `FEAT-110` Loading, empty, and error states
- `FEAT-111` External-service fallback
- `FEAT-112` Responsive and accessibility pass
- `FEAT-113` Seed scenario validation
- `FEAT-114` Demo script and presentation data
