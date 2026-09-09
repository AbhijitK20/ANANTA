# Acceptance Criteria

## Map

- Mumbai/Navi Mumbai map loads without a paid service.
- Launch zones can be selected.
- Markers cluster and open detail cards.
- List view contains the same visible records.
- Route fallback is visible when routing fails.

## Search and Recommendations

- Search supports category and zone.
- Natural language extracts or asks for missing hard constraints.
- Closed, unavailable, over-budget, inaccessible, and infeasible records are excluded.
- Every result contains an explanation or a clear fallback explanation.
- Excluded candidates have a reason when appropriate.

## Planning

- Total duration includes activity, travel, waiting, and buffer.
- Hard budget is never exceeded.
- Deadline plans arrive before the required time.
- Itinerary items do not overlap.
- Alternative plans show meaningful tradeoffs.

## Events

- Expired events are not active results.
- Event result shows source confidence and last checked time.
- Unverified social discovery is labeled and not shown as confirmed.
- Changed event data enters review.

## Experience Media

- Approved YouTube media appears on the relevant detail page.
- Instagram media uses an approved embed or external-link fallback.
- Creator and platform attribution are visible.
- Media is not autoplayed in cards.
- Deleted, private, unavailable, or rejected media is not shown as active.
- Current price, hours, availability, and booking status remain sourced from structured data.

## Adaptation

- Affected items are identified.
- Alternatives preserve hard constraints.
- User confirms before a real plan changes.
- Change history is visible.

## Data Operations

- Provider submission enters review.
- Admin can approve, reject, mark stale, or archive.
- User report enters queue.
- Hidden-gem candidate retains provenance and reviewer.
