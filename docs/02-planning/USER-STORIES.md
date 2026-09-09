# User Stories

## Story Format

```text
As a [user], I want [capability], so that [outcome].
```

## P0 Stories

### US-001: View Launch Geography

**As a traveler**, I want to see Mumbai and Navi Mumbai on an interactive map, **so that** I can understand where experiences are located.

**Acceptance criteria:** Map loads without a paid SDK; launch zones are visible; user can zoom and pan; list fallback exists.

### US-002: Explore Clustered Experiences

**As a traveler**, I want experience markers clustered by area, **so that** the map remains usable when many places exist.

**Acceptance criteria:** Markers cluster; clusters expand on selection; marker cards open; map and list stay synchronized.

### US-003: Store Structured Experience Records

**As an operator**, I want structured experience records, **so that** recommendations can use reliable operational facts.

**Acceptance criteria:** Record supports location, price, duration, hours, capacity, tags, accessibility, source, and freshness.

### US-004: Track Data Provenance

**As an operator**, I want source and freshness metadata, **so that** travelers are not shown unexplained stale information.

**Acceptance criteria:** Published record includes source URL, verification state, confidence, and timestamps.

### US-005: Search Experiences

**As a traveler**, I want to search by phrase and zone, **so that** I can find relevant options quickly.

**Acceptance criteria:** Keyword and zone search work; results show useful empty-state guidance; pagination or viewport loading is used.

### US-006: Filter Experiences

**As a traveler**, I want filters for budget, duration, distance, and category, **so that** I can narrow the result set.

**Acceptance criteria:** Filters apply before ranking; selected filters persist in the current search state; hard filters cannot be bypassed.

### US-007: Describe Intent Naturally

**As a traveler**, I want to describe my request naturally, **so that** I do not need to know the platform's filter vocabulary.

**Acceptance criteria:** System extracts location, time, budget, interests, group, and deadline when present; missing hard constraints are requested or marked; extracted values can be edited.

### US-008: Exclude Impossible Options

**As a traveler**, I want impossible experiences excluded, **so that** recommendations remain realistic.

**Acceptance criteria:** Closed, unavailable, inaccessible, over-budget, and infeasible items are excluded; the LLM cannot override backend constraints.

### US-009: View Feasibility

**As a traveler**, I want to know whether a plan is feasible, **so that** I can trust the result.

**Acceptance criteria:** Plan displays confidence/feasibility and unresolved data warnings; score reflects time, budget, availability, route, and deadline quality.

### US-010: Understand Recommendations

**As a traveler**, I want to know why an experience was recommended, **so that** I can make an informed decision.

**Acceptance criteria:** Explanation cites matching preferences, time, distance, budget, availability, trust, and relevant tradeoffs.

### US-011: Understand Exclusions

**As a traveler**, I want to know why an option was excluded, **so that** I can decide whether to relax a soft constraint.

**Acceptance criteria:** Exclusion identifies a concrete reason such as closed, too far, over budget, unavailable, or deadline-infeasible; hard and soft failures are distinguished.

### US-012: Plan Before a Deadline

**As a traveler**, I want to plan before a train or flight, **so that** I do not miss it.

**Acceptance criteria:** Final destination and deadline can be entered; final travel and safety buffer are included; risky plans are rejected or marked infeasible.

### US-013: Calculate Total Cost

**As a traveler**, I want total cost calculated, **so that** I can stay within budget.

**Acceptance criteria:** Cost includes experiences, food, transport, fees, and add-ons; hard budgets are never exceeded; soft-budget tradeoffs are explained.

### US-014: Generate a Mini-Itinerary

**As a traveler**, I want an ordered mini-itinerary, **so that** I know what to do and when.

**Acceptance criteria:** Itinerary contains ordered items, timing, travel, cost, availability, and map route or textual fallback.

### US-015: Compare Valid Plans

**As a traveler**, I want to compare valid plans, **so that** I can choose between cost, localness, travel, variety, and relaxation.

**Acceptance criteria:** At least two valid plans appear when possible; each shows cost, time, travel, variety, and confidence; tradeoffs are clear.

### US-016: Find Nearby Live Events

**As a traveler**, I want nearby live events, **so that** I can use free time spontaneously.

**Acceptance criteria:** Expired events are excluded; results show reachability, source confidence, ticket status, and last checked time; unverified social discoveries are labeled.

### US-017: Adapt to Rain

**As a traveler**, I want an alternative when it rains, **so that** my outdoor plan remains useful.

**Acceptance criteria:** Outdoor items are identified; indoor alternatives preserve hard constraints; cost and schedule changes are shown; confirmation is required.

### US-018: Adapt to Unavailability

**As a traveler**, I want an alternative when an activity is unavailable, **so that** I am not left without a plan.

**Acceptance criteria:** Unavailable items are removed; alternatives are ranked by preference, time, budget, distance, and reliability; change history is recorded.

### US-019: Submit an Experience

**As a provider**, I want to submit a structured experience, **so that** interested travelers can discover it.

**Acceptance criteria:** Provider enters location, category, description, price, duration, hours, capacity, accessibility, and source; listing enters review before publication.

### US-020: Manage Availability

**As a provider**, I want to close a slot or change capacity, **so that** recommendations reflect reality.

**Acceptance criteria:** Provider can update availability; invalid capacity is rejected; current confirmed state affects recommendations and booking simulation.

### US-021: Review Submitted Records

**As an admin**, I want to review submitted records, **so that** travelers receive trustworthy information.

**Acceptance criteria:** Admin can approve, reject, request changes, or mark stale; source and freshness are visible; action is audited.

### US-022: Report Incorrect Information

**As a traveler**, I want to report incorrect information, **so that** stale data can be corrected.

**Acceptance criteria:** User selects a reason; report references the record; report appears in the admin queue; user receives confirmation.

### US-023: See It Before You Go

**As a traveler**, I want to watch approved YouTube videos or open approved Instagram Reels for a place, **so that** I can understand its atmosphere before visiting.

**Acceptance criteria:**

- Experience detail shows approved external media.
- Media displays thumbnail, platform, creator attribution, title, and publish date where available.
- YouTube uses an approved embed or watch link.
- Instagram uses an approved embed or external-link fallback.
- Media is not treated as current price, hours, availability, safety, or booking truth.

### US-024: Verify External Media

**As an admin**, I want to verify, reject, mark stale, or archive external media, **so that** users do not receive broken or misleading videos.

**Acceptance criteria:**

- Admin can inspect source URL, parent place/event, creator, platform, and last checked time.
- Admin can verify that the media matches the location.
- Unavailable, deleted, private, or misleading media can be archived.
- Action is recorded in the audit history.

## P1 Stories

### US-030: Discover Near Transit

**As a traveler**, I want experiences near railway or metro stations, **so that** I can plan around Mumbai's public transport.

**Acceptance criteria:** Station/radius can be selected; results show distance and estimated travel time; transport mode is visible.

### US-031: Rank Reliable Providers

**As a traveler**, I want reliable providers ranked higher, **so that** ratings do not hide frequent cancellations.

**Acceptance criteria:** Response time, cancellation rate, completion rate, availability accuracy, and listing accuracy affect ranking.

### US-032: Review Hidden-Gem Candidates

**As an admin**, I want to review hidden-gem candidates, **so that** low popularity is not mistaken for quality.

**Acceptance criteria:** Candidate shows source, local evidence, confidence, safety flags, and verification history; sensitive locations can be restricted.

### US-033: Detect Event Changes

**As an admin**, I want changed event details detected, **so that** cancelled or moved events do not remain trusted.

**Acceptance criteria:** Date, venue, time, ticket, registration, or cancellation changes are flagged for review.

### US-034: Review a Completed Experience

**As a traveler**, I want to review a completed experience, **so that** future recommendations improve.

**Acceptance criteria:** Review attaches to a completed or simulated booking; review can be moderated; themes can be summarized without replacing the original.

### US-035: See Provider Demand Alerts

**As a provider**, I want demand alerts, **so that** I can improve availability and offerings.

**Acceptance criteria:** Provider sees high interest, unused slots, stale listing notices, and basic conversion signals without unnecessary private traveler data.

### US-036: Save and Share a Plan

**As a traveler**, I want to save and share a plan, **so that** I can reopen it or coordinate with others.

**Acceptance criteria:** Saved plan can be reopened; shared plan is read-only; stale availability is visibly marked when reopened.

### US-037: Report Broken Media

**As a traveler**, I want to report a broken or misleading video, **so that** the platform can remove or recheck it.

**Acceptance criteria:** User selects a reason; report references the media item; report enters the admin queue; active status is not changed without review.
