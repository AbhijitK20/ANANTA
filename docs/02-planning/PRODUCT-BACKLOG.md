# Product Backlog

## Story Format

> As a **[user]**, I want **[capability]**, so that **[outcome]**.

## P0 Stories

| ID | Feature | User story | Acceptance summary | Estimate |
|---|---|---|---|---:|
| US-001 | FEAT-010 | As a traveler, I want to see Mumbai and Navi Mumbai on an interactive map. | Map loads, pans, zooms, and shows launch zones. | 3 |
| US-002 | FEAT-012 | As a traveler, I want experience markers clustered by area. | Markers cluster and expand at useful zoom levels. | 3 |
| US-003 | FEAT-020 | As an operator, I want structured experience records. | Record supports location, price, duration, hours, capacity, tags, and suitability. | 5 |
| US-004 | FEAT-024 | As an operator, I want source and freshness metadata. | Published record shows source URL, verification state, confidence, and timestamps. | 3 |
| US-005 | FEAT-041 | As a traveler, I want to search by phrase and zone. | Search returns relevant records and no-results guidance. | 3 |
| US-006 | FEAT-043 | As a traveler, I want filters for budget, duration, distance, and category. | Filters apply before ranking and are reflected in URL/state. | 5 |
| US-007 | FEAT-042 | As a traveler, I want to describe my request naturally. | Intent extracts location, time, budget, interests, group, and deadline. | 5 |
| US-008 | FEAT-051 | As a traveler, I want impossible experiences excluded. | Closed, unavailable, inaccessible, over-budget, and infeasible options are excluded. | 5 |
| US-009 | FEAT-053 | As a traveler, I want to know whether a plan is feasible. | Plan displays score/confidence and unresolved data warnings. | 3 |
| US-010 | FEAT-054 | As a traveler, I want to know why an experience is recommended. | Explanation cites matching preferences, time, distance, budget, and availability. | 3 |
| US-011 | FEAT-055 | As a traveler, I want to know why an option was excluded. | Exclusion reason identifies the failed constraint. | 3 |
| US-012 | FEAT-061 | As a traveler, I want to plan before a train or flight. | Plan ends before deadline with travel and safety buffer. | 5 |
| US-013 | FEAT-062 | As a traveler, I want total cost calculated. | Cost includes experiences, food, transport, fees, and add-ons. | 3 |
| US-014 | FEAT-064 | As a traveler, I want a mini-itinerary generated. | Itinerary includes ordered items, timing, travel, cost, and map route. | 5 |
| US-015 | FEAT-065 | As a traveler, I want to compare valid plans. | At least two plans show cost, time, travel, variety, and confidence. | 5 |
| US-016 | FEAT-046 | As a traveler, I want nearby live events. | Results exclude expired events and show reachability and source confidence. | 5 |
| US-017 | FEAT-072 | As a traveler, I want an alternative when it rains. | Outdoor activity is replaced with validated indoor alternatives after confirmation. | 5 |
| US-018 | FEAT-074 | As a traveler, I want an alternative when an activity is unavailable. | Alternatives preserve hard constraints and update the itinerary. | 5 |
| US-019 | FEAT-091 | As a provider, I want to submit an experience. | Provider can enter structured listing data and submit for review. | 5 |
| US-020 | FEAT-092 | As a provider, I want to close a slot. | Availability update affects recommendations and booking simulation. | 3 |
| US-021 | FEAT-030 | As an admin, I want to review submitted records. | Admin can approve, reject, request changes, or mark stale. | 5 |
| US-022 | FEAT-034 | As a traveler, I want to report incorrect information. | Report enters a visible admin queue with record and reason. | 3 |
| US-023 | FEAT-047 | As a traveler, I want to watch approved local videos for a place. | Detail page shows external video cards with attribution and platform fallback. | 3 |
| US-024 | FEAT-037 | As an admin, I want to verify and archive media links. | Admin can approve, reject, mark stale, or archive an external media record. | 3 |

## P1 Stories

| ID | Feature | User story | Acceptance summary | Estimate |
|---|---|---|---|---:|
| US-030 | FEAT-015 | As a traveler, I want experiences near a railway or metro station. | Station radius filter returns nearby experiences. | 3 |
| US-031 | FEAT-057 | As a traveler, I want reliable providers ranked higher. | Response, cancellation, completion, and accuracy signals affect ranking. | 5 |
| US-032 | FEAT-035 | As an admin, I want to review hidden-gem candidates. | Candidate shows source, confidence, safety flags, and verification history. | 5 |
| US-033 | FEAT-084 | As an admin, I want changed event details detected. | Date, venue, ticket, or cancellation changes are flagged. | 5 |
| US-034 | FEAT-100 | As a traveler, I want to review a completed experience. | Review attaches to a completed or simulated booking. | 3 |
| US-035 | FEAT-094 | As a provider, I want demand alerts. | Provider sees high interest, unused slots, and stale listing notices. | 3 |
| US-036 | FEAT-067 | As a traveler, I want to save and share a plan. | Saved plan can be reopened and shared as a read-only view. | 3 |
| US-037 | FEAT-106 | As a traveler, I want to report broken or misleading media. | Media report enters the operations queue with a reason. | 2 |

## Prioritization Rules

- P0 must be demo-ready before P1 begins.
- Hard feasibility and data trust outrank visual polish.
- A story is not complete if it only works with live external services.
- Prefer vertical slices over isolated frontend or backend work.

## Definition of Ready

- User and outcome are clear.
- Acceptance criteria are testable.
- Dependencies are identified.
- Seed data or mock behavior is defined.
- Design and API decisions required for the story are available.

## Definition of Done

- Acceptance criteria pass.
- Loading, empty, and error states exist.
- Mobile layout works.
- Authorization and validation are applied.
- Relevant automated or manual test exists.
- Source and freshness metadata are preserved where applicable.
- Demo path works without paid services.
- Peer review is complete.
