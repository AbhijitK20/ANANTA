# User Journeys

## Journey 1: Three Hours Near CST

**Input:** Family of three, near CST, three hours, ₹1,500, local food and culture.

1. User enters the request.
2. Intent parser extracts location, duration, budget, interests, and group.
3. Candidate generator searches the curated Mumbai dataset.
4. Hard filters remove closed, unavailable, too expensive, inaccessible, or infeasible options.
5. Ranking returns multiple plans.
6. Map displays route, transit points, and buffers.
7. User compares Cheapest and Most Local plans.
8. User saves or simulates booking.

## Journey 2: Before a Train

**Input:** One hour before a train from Vashi Station.

1. User sets final destination and departure time.
2. Planner works backward from the train deadline.
3. Candidate plans include return travel and safety buffer.
4. Experiences that risk the deadline are excluded with reasons.
5. User receives a short, high-confidence plan.

## Journey 3: Happening Near Me

1. User selects current location and opens live events.
2. System checks event start time, route estimate, budget, category, and weather.
3. Expired or unverified events are excluded or labeled.
4. Results show event confidence, source, ticket status, and reachability.

## Journey 4: Rain Disruption

1. Existing plan contains an outdoor experience.
2. Rain scenario is triggered.
3. System identifies the affected item.
4. Indoor alternatives are filtered by time, budget, distance, group, and availability.
5. User compares alternatives and confirms one.
6. Itinerary and map route update with change history.

## Journey 5: Provider Update

1. Provider submits a weekend workshop.
2. Provider enters location, duration, price, capacity, schedule, accessibility, and source.
3. Admin reviews and approves the listing.
4. Provider closes one slot.
5. Recommendation and booking simulation reflect the reduced availability.

## Journey 6: Incorrect Information

1. Traveler reports that an event is cancelled or a price is wrong.
2. Report enters the admin data queue.
3. Operator checks the source and provider.
4. Record is corrected, marked stale, or archived.
5. Affected recommendations are recalculated.
