# Map and Routing

## MVP Stack

- Map renderer: MapLibre GL JS.
- Geographic base data: OpenStreetMap.
- Prototype tiles: a permitted OpenFreeMap or equivalent tile provider.
- Route adapter: OSRM, OpenRouteService, or Valhalla.
- Application places/events: internal PostgreSQL records.

## Map Requirements

- Mumbai and Navi Mumbai launch boundaries.
- Zone selection and neighborhood labels.
- Clustered markers.
- Category layers.
- Experience/event marker cards.
- List alternative to the map.
- Selected itinerary route.
- Nearby railway, metro, bus, and ferry points.
- Viewport-based loading.

## Routing Rules

1. Check a cached route result.
2. If absent, request the configured route adapter.
3. Store source, mode, duration, distance, and timestamp.
4. Apply a buffer based on mode and context.
5. If the adapter fails, use a curated estimate or show an unavailable warning.
6. Never invent live traffic or transit status.

## Travel Modes

The initial model supports walking, taxi/auto, private vehicle, and optional curated transit estimates. Real-time public-transit routing is a later enhancement.

## Cost and Usage Rules

- Cache identical routes.
- Avoid routing every marker; route only selected candidates and itinerary segments.
- Keep public endpoint request rates within their policies.
- Preserve attribution requirements.
- Move to self-hosted routing or tiles if usage grows.
