# Test Plan

## Test Layers

### Unit Tests

- Budget arithmetic
- Duration and buffer arithmetic
- Opening-hours checks
- Capacity checks
- Deadline checks
- Ranking score components
- Event expiry
- State transitions

### Integration Tests

- Search filters against PostgreSQL
- Recommendation pipeline with seeded records
- Route-cache adapter
- Provider availability update
- Admin verification workflow
- Report and audit workflow

### End-to-End Tests

1. Search near CST for local food and culture.
2. Create a four-hour family plan under ₹1,500.
3. Verify map route and deadline buffer.
4. Trigger rain and confirm indoor alternative.
5. Open `Happening Near Me` and exclude expired events.
6. Provider closes a slot and verify recommendation change.
7. Submit incorrect-information report and process it as admin.

## Critical Invariants

- A hard constraint cannot be bypassed by AI output.
- Expired events cannot be recommended.
- No itinerary overlap.
- No negative capacity.
- No published record without a source URL.
- No confirmed availability from an unverified source.
- No unauthorized provider or admin mutation.

## Manual Demo Checklist

- Test with external APIs disabled.
- Test narrow mobile width.
- Test empty search results.
- Test stale source warning.
- Test unavailable route.
- Test missing weather.
- Test keyboard-only navigation for the main flow.
