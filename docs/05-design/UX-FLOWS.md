# UX Flows

## Navigation

```text
Home · Explore · Trips · Saved · Profile
```

Provider and admin users receive separate role-specific navigation.

## Home

- Location or destination selector
- Natural-language request input
- `What can I experience right now?`
- `Plan Around Me`
- `Happening Near Me`
- Recommended experiences
- Nearby local favorites
- Live event preview

## Explore

- Map/list toggle
- Zone selector
- Search
- Category layers
- Filters
- Clustered results
- Travel-time radius
- Transit-point context

## Recommendation Card

Show:

- Name and category
- Price and duration
- Distance and travel time
- Availability status
- Feasibility/confidence
- Trust and freshness indicators
- Why recommended
- Key tradeoff
- Save and inspect actions

## Plan View

- Timeline
- Map route
- Travel segments
- Total cost
- Total duration
- Deadline status
- Confidence and warnings
- Compare plans
- Change plan
- Save/share/booking simulation

## Experience Detail

- Real or properly licensed image gallery when available
- Experience name, price, duration, travel time, availability, and trust status
- `See It Before You Go` media section
- Reviews and review intelligence
- Accessibility, suitability, and safety information
- Mini-map and nearby transit points
- Source and freshness details
- Add to plan and availability actions

### See It Before You Go

The media section uses horizontal cards for approved YouTube videos, YouTube Shorts, Instagram Reels, provider videos, and local creator videos.

Each card shows:

- Static thumbnail and play icon
- Platform badge
- Creator or channel
- Title and duration
- Publish date where available
- Verification label
- `Watch on YouTube` or `Open on Instagram` fallback

Do not autoplay videos in recommendation cards. Add a warning such as `May not reflect current prices or opening hours` for older videos.

The page must clearly separate:

```text
See the atmosphere → External media
Know what is current → Verified structured facts
```

## Change Flow

1. User chooses a change such as rain, less time, cheaper, closer, or unavailable.
2. System identifies impacted itinerary items.
3. Alternatives appear with tradeoffs.
4. User confirms.
5. Plan and map update.

## Provider Flow

- Dashboard
- Create experience
- Availability calendar
- Booking view
- Demand alerts
- Listing freshness

## Admin Flow

- Operations queue
- Record detail and source
- Approve/request changes/reject/archive
- Duplicate resolution
- Event expiry and change review
- Hidden-gem review
- Reports
