# Data Model

## Core Entities

### User

- `id`
- `role`: traveler, provider, moderator, admin
- `name`
- `email`
- `created_at`

### TravelerProfile

- `user_id`
- `travel_style`
- `budget_preference`
- `pace`
- `walking_tolerance`
- `accessibility_requirements`
- `preferred_categories`
- `temporary_context`

### Provider

- `id`
- `owner_user_id`
- `name`
- `description`
- `contact`
- `verification_status`
- `reliability_metrics`
- `created_at`

### Experience

- `id`
- `provider_id`
- `name`
- `description`
- `category`
- `tags`
- `latitude`, `longitude`
- `city`, `zone`, `neighborhood`
- `nearby_transit`
- `duration_minutes`
- `price_amount`, `currency`
- `capacity`
- `opening_hours`
- `indoor_outdoor`
- `age_suitability`
- `accessibility`
- `safety_information`
- `booking_requirement`
- `status`
- `confidence`
- `last_verified_at`

### ExperienceSource

- `id`
- `experience_id`
- `source_type`
- `source_url`
- `raw_title`
- `raw_content_reference`
- `submitted_by`
- `verification_status`
- `confidence`
- `collected_at`
- `last_checked_at`

### Event

- `id`
- `name`
- `description`
- `organizer`
- `venue`
- `latitude`, `longitude`
- `start_at`, `end_at`
- `price_amount`, `currency`
- `ticket_url`
- `capacity_status`
- `verification_status`
- `source_url`
- `last_checked_at`
- `status`: discovered, verified, published, changed, completed, archived

### ExperienceMedia

- `id`
- `experience_id` nullable
- `event_id` nullable
- `platform`: youtube, youtube_shorts, instagram, provider, other
- `external_media_id` nullable
- `source_url`
- `embed_url` nullable
- `thumbnail_url` nullable
- `title`
- `creator_name`
- `creator_handle` nullable
- `published_at` nullable
- `duration_seconds` nullable
- `media_type`: walkthrough, review, shopping_guide, food_tour, event, atmosphere, provider_intro
- `verification_status`: submitted, pending_review, verified, stale, unavailable, rejected
- `source_type`
- `last_checked_at`
- `is_active`
- `display_order`

An active media record must attach to exactly one experience or event. Store URLs and metadata only; do not store downloaded third-party video files.

### Zone and TransitPoint

- `Zone`: city, name, geometry, priority
- `TransitPoint`: type, name, coordinates, zone, service_status

### AvailabilitySlot

- `experience_id`
- `start_at`, `end_at`
- `capacity`
- `remaining_capacity`
- `status`
- `last_updated_at`

### Trip and Itinerary

- `Trip`: user, location, dates, group, budget, deadline
- `Itinerary`: trip, status, confidence, total_cost, total_minutes
- `ItineraryItem`: experience/event, order, start/end, status, source_version
- `TravelSegment`: origin, destination, mode, duration, distance, source, cached_at

### Report and Audit

- `DataReport`: record, reporter, reason, status, resolution
- `AuditLog`: actor, action, entity, before, after, timestamp

## State Machines

```text
Provider: Pending → Verified → Rejected / Suspended
Experience: Draft → Review → Published → Stale / Suspended / Archived
Event: Discovered → Parsed → Verified → Published → Changed → Completed → Archived
Booking: Pending → Confirmed → Cancelled → Completed
Itinerary: Draft → Active → Modified → Completed / Cancelled
```

## Integrity Rules

- Experience coordinates must be valid and inside the supported geography for curated launch records.
- A hard-budget plan cannot exceed the budget.
- An itinerary cannot contain overlapping items.
- Travel segments and buffers must fit between itinerary items.
- Capacity cannot become negative.
- Expired events cannot be recommended as active events.
- A source URL is required before a record becomes published.
- Approved media must have a valid external source URL and parent record.
- Media must not be used as evidence for current price, hours, availability, safety, or booking state.
- Availability claims must include a recent timestamp.
