# MVP Scope

## Scope Rule

Build a trustworthy, free-first decision engine for Mumbai and Navi Mumbai. Do not optimize for the largest number of listings or integrations.

## Pre-Implementation Gate

No production screen should be implemented until the team has approved:

- `docs/05-design/DESIGN-CONTRACT.md`
- `docs/05-design/CONTENT-STYLE-GUIDE.md`
- `docs/04-data/MEDIA-POLICY.md`
- Legal-page requirements in the masterplan and PRD
- `docs/06-quality/DESIGN-REVIEW-CHECKLIST.md`

## Must Have: P0

- MapLibre map with Mumbai/Navi Mumbai zones and curated markers
- OpenStreetMap-based map data and cached routing
- Seeded experiences, places, providers, and events
- Source URL, confidence, verification, and freshness fields
- Search, categories, filters, and map/list views
- Traveler preferences and natural-language request
- Hard constraint filtering
- Time, budget, group, accessibility, and weather-aware recommendations
- Feasibility score and recommendation explanations
- Exclusion reasons
- Deadline-aware mini-itinerary generation
- At least two plan variants when possible
- `What Can I Experience Right Now?`
- `Plan Around Me`
- `Happening Near Me`
- One adaptive scenario: rain, reduced time, unavailable activity, or cancelled event
- Provider listing and availability update
- Admin approval and data-operations queue
- Event expiry
- Basic incorrect-information reporting
- Approved external media on experience details, with YouTube-first support and Instagram link fallback

## Should Have: P1

- Route visualization with walking and taxi/auto estimates
- Transit-oriented discovery near stations
- Provider booking simulation
- Hidden-gem candidate review
- Event change detection
- Group voting
- Experience bundles
- Basic reviews and review summaries
- Field-level confidence display
- Basic provider demand alerts
- Media verification queue and media link-health checks

## Could Have: P2

- Voice input
- Image-based discovery
- Advanced public-transit routing
- Advanced what-if simulator
- Shared collaborative trips
- Demand forecasting
- Provider AI copilot
- Creator itineraries
- Real payment integration

## Out of Scope

- Global coverage
- Paid APIs as a core dependency
- Unlimited scraping of Instagram, YouTube, Facebook, Reddit, or other services
- Downloading or re-hosting third-party videos
- Native mobile applications
- Complex microservice infrastructure
- Fully automatic provider verification
- Autonomous booking or cancellation
- Public exposure of sensitive hidden locations without review

## MVP Demo Dataset

- 150–300 places and experiences
- 20–40 providers
- 20–50 recurring or live events
- Multiple categories, budgets, durations, zones, and accessibility profiles
- At least one confirmed event discovered from a public social or community source
- At least one hidden-gem candidate with provenance and verification history
- At least one fully booked item, rain-sensitive item, low-walking item, and deadline-sensitive scenario

## Definition of MVP Done

- Core flow works on desktop and mobile widths.
- All P0 acceptance criteria pass.
- External API failure has a visible fallback.
- No recommendation violates a hard constraint in seeded test scenarios.
- Event records expire correctly.
- Admin can correct a stale or incorrect listing.
- Demo data contains no unexplained placeholder claims.
- No secrets or private credentials are committed.
