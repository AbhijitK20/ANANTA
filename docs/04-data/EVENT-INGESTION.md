# Event Ingestion

## Event Lifecycle

```text
Discovered → Parsed → Deduplicated → Needs Confirmation → Verified → Published → Changed → Completed → Archived
```

## Required Event Fields

- Name
- Description
- Organizer
- Venue and coordinates
- Start and end time
- Category
- Price or free-entry status
- Capacity/ticket status when known
- Registration or booking URL
- Source URL
- Source confidence
- Last checked timestamp
- Verification status

## Deduplication

Compare event name, organizer, venue, date, time, booking URL, coordinates, and normalized text. Potential duplicates enter the data-operations queue rather than being silently merged.

## Change Detection

Recheck for changes to venue, date, time, ticket price, registration, capacity, and cancellation status. Changed events are marked and affected saved plans are recalculated or notified.

## Happening Near Me Rules

An event is eligible when:

- It has not expired.
- Its start time is reachable with travel and buffer.
- It fits budget and group requirements.
- It satisfies category and accessibility preferences.
- It is not known to be cancelled.

## Free-First Implementation

Begin with curated JSON/PostgreSQL records and admin-approved source links. Add connectors incrementally. A failed source connector must not remove a previously verified event without evidence.

## Event Media

An approved event may include external videos for atmosphere or event previews. Media must be linked to the event, verified separately, and archived when the event is completed or the media is unavailable. Media does not prove that the event is still running.
