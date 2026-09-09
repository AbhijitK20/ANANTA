# Data Sources and Governance

## Source Classes

### Geographic and Public Data

- OpenStreetMap and Overpass for coordinates, roads, paths, boundaries, places, and transit.
- Wikidata and Wikimedia for heritage facts, identifiers, and licensed media.
- Official tourism, municipal, museum, venue, park, and transport websites.

### Provider and Event Data

- Provider websites and direct provider submissions.
- Official venue and organizer calendars.
- Ticketing and registration platforms.
- University, cultural organization, newspaper, newsletter, and community event pages.

### Social and Community Discovery

- Public Instagram, YouTube, Facebook, Reddit, Telegram, local creators, blogs, and community pages.
- User and resident submissions.

Social content is a discovery signal. Use official APIs, provider submissions, manual review, and source links where possible. Do not copy full posts, personal data, or images without permission or an applicable license. Respect terms of service, rate limits, robots rules, and attribution requirements.

## External Media Sources

YouTube is the preferred first media source because official embeds and video identifiers are comparatively predictable. Instagram Reels may be accepted through provider or admin submission and displayed through an official embed where permitted, otherwise as an external link.

For every attached video, store the URL and metadata rather than downloading the media. Review whether the video shows the correct place or event, is public and attributable, can be embedded or linked lawfully, is still available, and may have outdated details. Video is contextual evidence only. Current price, hours, capacity, availability, accessibility, and booking status must come from verified structured records.

## Source Metadata

Every record should retain:

- `source_type`
- `source_url`
- `submitted_by`
- `collected_at`
- `last_checked_at`
- `last_verified_at`
- `verification_status`
- `confidence`
- `license_or_usage_note`

## Verification Levels

- **High:** Official organizer, venue, provider, or recently admin-confirmed.
- **Medium:** Established public event or tourism source with recent evidence.
- **Low:** Community or social discovery awaiting confirmation.

Never display low-confidence event discovery as confirmed availability.

## Freshness Rules

- Events are active only between their start and end times unless marked recurring.
- Availability must carry an update timestamp.
- Prices and opening hours become stale after a configured period.
- Stale records remain visible only with a clear warning or are removed from ranking.
- A user report can lower confidence and create a review task.

## Hidden-Gem Policy

A hidden-gem candidate needs positive evidence beyond low popularity:

- Local relevance
- Positive verified feedback
- Authenticity or uniqueness
- Provider reliability
- Fresh operational data
- Acceptable safety and community impact

Sensitive or fragile places may receive approximate locations, limited access, or no public recommendation.

## Ingestion Workflow

```text
Discover → Store Raw Reference → Normalize → Deduplicate → Verify → Publish → Monitor Freshness
```

Raw source records must be retained separately from published records so corrections and audits are possible.
