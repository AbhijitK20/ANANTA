---
name: ananta-honesty
description: The honesty and provenance rules for ANANTA. Use when writing any data field, any UI string, any number shown to a traveller, any rejection sentence, or any document. Encodes "every number is an estimate or it is sourced" and lists the specific fabricated claims the codebase shipped before, so they are never reintroduced. Triggers on "what should this field say", "provenance", "confidence", "is this claim supported", "what can I write in this sentence", "provenance badge", "why does the data not support this".
license: MIT
compatibility: opencode
metadata:
  project: ananta
  scope: data-and-copy
---

# ANANTA honesty rules

The product's differentiator is not "AI recommendations". It is that a
recommendation must **fit** and that we **show our work and prove it**. A
fabricated number does not merely reduce quality, it destroys the only thing this
project is for.

`MASTERPLAN.md` section 10: *every number is an estimate or it is sourced. No
exceptions, in data or in copy.*

---

## 1. Per-field provenance, not per-record confidence

Every field carries its own `Provenance` and `Confidence`:

```ts
type Provenance = "curated" | "provider" | "osm" | "inferred" | "derived";
type Confidence = "verified" | "community" | "estimate" | "unverified";
```

**One `confidence` string for a whole record is not enough.** The existing
`"Location matched on OpenStreetMap; visit facts are demo estimates"` conflates
two independent axes. A traveller cannot tell that the price is a guess and the
coordinates are real, which is exactly the distinction they need.

`"Price: inferred, low confidence"` is a different claim from
`"Coordinates: OSM, verified"`. Render them separately.

## 2. A hash is not a source

The single rule that most changes the product:

> A value produced by `hash(id) % band`, a template, or an area-centre pin is
> `inferred` + `estimate`, with a low `score`, and an honest `note`.

It is **never** `curated`. The codebase shipped 1064 records labelled
`"Curated record"` whose every price, duration and travel time came from
`lib/data/factory.ts:83-85`, a Java-style hash accumulator. That single mislabelling
is the difference between an honest dataset and a fabricated one.

Consequences downstream, and they are enforced in code:

- An `estimate`-confidence price contributes **zero** to the `value` score
  component. A guessed price must not be allowed to buy ranking.
- A `estimate` travel time may not satisfy the time hard-constraint on its own.
  `lib/plan.ts:60` gates feasibility on `travelMinutes`, and when that value was
  `4 + (hash % 46)` a green "Feasible" badge meant nothing about the traveller's
  actual day.
- The UI must show it as an estimate, adjacent to the number, not in a tooltip.

## 3. `null` and `unverified` are correct answers

Eight of the fifteen graded fields did not exist before this work: opening hours,
capacity, accessibility, indoor/outdoor, diet, seasonality, best time of day,
ratings. The schema had nowhere to put them, so every filter built on them was
structurally impossible.

**Do not invent them to make a demo look complete.** Write `null`, or write
`confidence: "unverified"` and no value.

An honest `"Opening hours are unverified, so we will not claim it is open"` is a
*better* demo than a fabricated `10:00 to 19:00`. The first one is a rejection the
traveller can reason about. The second one is a lie with a timestamp.

This is not a compromise. It is the product. The feasibility gate abstains rather
than guesses, and abstention is a first-class outcome.

## 4. Never invent a citation

`sourceUrl` is `string | null`. `null` when there is no real source.

**Never `example.com`.** It shipped on 1107 of 1107 records via `lib/seed.ts:29`
and `factory.ts:153`, a guaranteed 404 on a field shaped exactly like a citation,
and `lib/hidden-gems.test.ts:7` asserted the fake was present. A citation that is
guaranteed to fail is worse than no citation, because it teaches the reader to
trust a field that means nothing.

A non-null `sourceUrl` needs a real registrable domain and a test asserting it.

## 5. Never invent attribution

All 70 generated images carried the literal credit `"Wikimedia Commons
contributor"`. That is not a photographer and not a licence. Wikimedia Commons
attribution requires naming the author, so this is a licensing-compliance defect,
not cosmetics.

Hand-authored records in `lib/seed.ts` do carry real credits, which is why the
pattern was obvious once you looked. Capture the real author and
`LicenseShortName` from `extmetadata` and store them.

## 6. Rejections are sentences with numbers

- Finished sentence: "Needs 40 min more than you have left."
- Banned: "constraint violated", "not eligible", a bare "unavailable".
- Banned: "A rejection is a feature, not an error." If we cannot say why something
  is missing, the engine is not finished.

All sentences come from `REJECTION_CODES` in `lib/engine/contracts/codes.ts`. No
stage module writes an English literal for a rejection.

## 7. Never present a string template as a measurement

The catalogue of real fabrications, so they are never reintroduced:

| Shipped | Why it is a lie |
|---|---|
| `` `${index + 1}:15 PM` `` as a stop time | A template. Stop 2 is always 2:15 PM regardless of durations, deadline or start time. |
| "Selected because it matches the current interest and sits inside the available plan area" | Printed identically for every stop. No interest model existed and no area check ran. |
| "This option keeps the rest of the plan within the current area" | The alternative was `array.find`, first match in index order. No area check exists. |
| `Math.max(counts[id], 4)` on a demand tile | Invented data shaped to trip a threshold, wearing a real-looking number. |
| "Find **verified** local experiences" in the meta description | About 96% of the catalogue is generated. This is the first thing any crawler reads. |
| "Remove from ranking until checked" on Mark stale | Nothing reads the operations status. Nothing is removed. |
| "Service area confirmed", hardcoded JSX | No service-area field exists. |
| "Capacity" in the provider copy | No capacity field exists on the type. |

**The test:** point at the field or the function that produced the claim. If you
cannot, delete the sentence. Deleting a claim is nearly free. Retracting it later is
not.

## 8. Estimates are labelled, adjacent, and specific

Not "estimated". Write "estimated: 24 min by taxi, straight-line distance with an
average congestion factor". The reader can then decide how much to trust it.

The existing disclosures in this codebase are genuinely good and set the bar:
`lib/routing.ts:179-186` labels the straight-line fallback, `lib/location.ts:66-70`
labels proximity as a straight-line estimate, `app/explore/page.tsx:229-232`
explains every confidence tier. Match that register. Do not exceed it.

## 9. Documentation is part of the honesty surface

`docs/03-technical/API-SPEC.md` documents 23 endpoints. There are zero route
handlers. `ARCHITECTURE.md` draws a PostgreSQL box. `Local-Experiences-Masterplan.md`
is 2198 lines containing the product name zero times.

**An unimplemented plan is fine. An unimplemented plan presented as built is not.**
Either mark it proposed, or delete it. And a status column beats a bare checklist:
30 acceptance criteria with 22 verified and 8 marked "not built, no data field"
reads as engineering. 30 criteria with 0 status reads as a wish list.

## 10. House style

- No em dash (U+2014). No dash of any kind as a clause separator.
- No emoji.
- Plain words. "Uses about 24 minutes", not "optimises traversal duration".
- `components/ui.tsx` is 21 lines and 3 exports, and the app looks consistent
  because the copy is disciplined, not because there is a design system. Do not
  introduce one.
