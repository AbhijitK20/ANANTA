# SESSION 8 of 10 — Data: Graded Fields, Provenance, and Integrity

> Copy everything below this line into a new session.

---

You are session 8 of 10 working simultaneously on **ANANTA**, a fit-first local
discovery engine at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You own the input to every other session. If your `ExperienceV2` records are
dishonest about what is known, the entire product is a machine for confidently
displaying fabrications, and no amount of good engineering downstream fixes that.
Your job is to make the data say where every field came from.

## Read first

1. `MASTERPLAN.md` sections 5, 6 and 10.
2. `SESSION/00-CONTRACTS.md` **completely**. Section 2 for the `ExperienceV2`
   shape, section 6 for the data handoff contract that nine sessions depend on.
3. `lib/seed.ts` (the current 27-field `Experience`, 43 hand-written records),
   `lib/data/factory.ts` (`buildExperiences`, the `hash` function, `derivePin`,
   `pickVideo`, the `confidence` strings), `lib/data/zones.ts` (23 rows),
   `lib/data/index.ts`, `lib/data/dataset.test.ts` (12 tests, several currently
   failing), and all ten `lib/data/places/*.ts` category tables.
4. `scripts/geocode-places.ts` and `scripts/geocode-overpass.ts`.

## What is real and what is fabricated, verified

| Thing | Reality |
|---|---|
| Record count | **1107** = 43 hand-written in `lib/seed.ts` + 1064 generated from the 10 category tables |
| Place names | **Real.** Genuine Mumbai and Navi Mumbai businesses, streets, parks, areas, across 23 neighbourhood anchors |
| Coordinates | **383 to 391 real** (OSM, committed snapshot). The other ~720 are `derivePin()` at `factory.ts:73-78`: the neighbourhood anchor jittered by plus or minus 0.008 degrees, about 800 m |
| `price`, `duration`, `travelMinutes` | **Fabricated.** `factory.ts:83-85` is `hash(id) % band` over a per-category list. A Fort restaurant gets one of six arbitrary price bands |
| `openingHours`, `capacity`, `access`, `diet`, `indoor`, `kidFriendly`, `season`, `bestTimeOfDay` | **Do not exist.** 8 of the graded fields have no field on the type, so every filter built on them is structurally impossible |
| `bestTimeOfDay` | Set on 15 of 1104 records, 1.4%, all hand-written. The "Best time" quick filter therefore auto-excludes about 1061 records with the reason "No best-time guidance recorded for this place" |
| `rating`, `reviewCount`, reviews | **Do not exist.** Zero grep hits. So there is nothing to do Bayesian smoothing on |
| `source` | `factory.ts:152` hardcodes `"Curated record"` on all 1064 generated records, whose every fact is a hash |
| `confidence` | Only two possible values on generated records, both honest sentences. The **one** thing this codebase does well |
| `sourceUrl` | `https://example.com/sources/<id>` on **1107 of 1107** records. `example.com` is IANA's reserved example domain, so every "citation" is a guaranteed 404. It is also never rendered in any UI, and `lib/hidden-gems.test.ts:7` asserts the fake URL is present |
| Images | 70 Wikimedia files for 1107 records, so 15.8 venues share one photo. All 70 carry the identical literal credit `"Wikimedia Commons contributor"`, which is not a photographer and not a licence. Commons attribution requires naming the author |
| Videos | 340 oEmbed-verified uploads, relevance-scored with a reuse ceiling. Genuinely good work |

## Bugs that are currently red or silently dropping data

1. **`npm test` is RED on `main`.** `lib/data/dataset.test.ts:11` requires
   `>= 100` records per category. Measured from source: Culture = **90**, Nature =
   **98**. Every other category passes, three exactly at 100. So the suite a judge
   runs first fails. Fix by adding real names, not by lowering the assertion.
2. **Three places are silently discarded.** `lib/data/places/nature.ts:69` uses the
   area key `"Breach Candy"`, which is **absent from `zoneRows`**
   (`lib/data/zones.ts:9-33`). `factory.ts:123` does `if (!zoneRow) continue;` with
   no warning, so "Banganga tank banyan shade hour", "Walkeshwar ridge green trail"
   and "Breach Candy Coolie Park loop" are authored and never emitted. Add the zone
   row with real coordinates and a real nearest station.
3. **About 35 OSM pins point at the wrong venue.** Auditing the 391 rows in
   `lib/data/geocoded.generated.ts`: `Gokul`, a Fort food venue, is pinned to
   `गोकुळदास तेजपाल रुग्णालय`, a Marathi-language hospital. `IIT Bombay heritage
   buildings walk` and `IIT Bombay green trail edge` are both pinned to `small
   swimming pool`. `Galleria Market` is pinned to `Gelleria Optics`. Six different
   places are all pinned to the same Flora Fountain area element. About 10 matches
   are in Devanigari so a reviewer cannot even sanity-check them.
   **`lib/data/dataset.test.ts:35-52` only checks distance from the anchor, not
   identity**, which is exactly why CI is green over a hospital pinned to a
   restaurant. The strict matcher in `scripts/geocode-overpass.ts:225-265` was
   written to kill this class of bug in commit `bfa2e43` and **has never been run
   against the committed file**: `geocoded.generated.ts:1` still carries the
   single-script header, while the Overpass script writes a two-script header.
4. **8 geocoded rows are stale**, ids that no longer correspond to any place. The
   monthly workflow only prunes on distance, never on id-not-a-place, so they rot
   forever.

## ALLOWED — you own these files, exclusively

```
lib/data/places/*.ts
lib/data/zones.ts
lib/data/factory.ts
lib/data/index.ts
lib/data/dataset.test.ts
lib/data/curated/*.ts            new, your hand-authored Experience layer
lib/data/ananta/records.ts
lib/data/ananta/curated.ts
lib/data/ananta/provenance.ts
lib/data/ananta/adapter.ts
lib/data/ananta/index.ts
lib/data/ananta/*.test.ts
lib/data/provenance.test.ts
scripts/geocode-places.ts
scripts/geocode-overpass.ts
scripts/verify-media.mjs
SESSION/BLOCKERS/8.md
```

## FORBIDDEN

```
lib/seed.ts               FROZEN. Everyone reads it. Nobody edits it.
lib/engine/**             sessions 1 to 7 and 10
app/**  components/**     sessions 9 and 10
docs/**  .github/**        session 10
package.json  tsconfig.json  .eslintrc.json  vitest.config.ts  next.config.mjs  next.config.mjs
scripts/qa-*.mjs          session 10
```

`lib/seed.ts` is frozen deliberately. It is what 1107 records already satisfy.
Session 1 defines `ExperienceV2` beside it, you populate it. Nobody edits the old
type, so nothing breaks while the two coexist.

## Task

### 1. `lib/data/zones.ts` — add `Breach Candy`

Real coordinates for the Breach Candy / Kamathipura hill area, and the real nearest
station. Use the actual locality, not a guess, and put the coordinate in the same
format as the other 23 rows. Then add a test asserting **every area key used by
every `lib/data/places/*.ts` file exists in `zoneRows`**. That test prevents this
class of silent drop forever, and it is the highest-value five lines in your
session.

### 2. `lib/data/places/*.ts` — get Culture to 100 and Nature to 100

Add **real** place names. These are genuine businesses, streets, parks, galleries
and institutions in the existing areas. Do not pad with invented collectives. The
tables already contain some that read like descriptions of a category of stalls
rather than recordable entities, for example `"Bora Bazar lunch counters"`,
`"Carter Road khau galli"`, `"Nerul khau galli"`, `"Vashi rock garden green corner"`,
`"Aarey roadside bhutta carts"`, and near-duplicates where the same park becomes
two records (`"Shivaji Park green loop"` and `"Shivaji Park sea-face morning walk"`).

While you are in there, **delete the ones that are not real places** or that
duplicate another record for the same physical location. A 100-record category of
which 12 are invented collectives is worth less than an 88-record category of real
places, and the masterplan's credibility argument depends on this being true. Say
in your summary how many you removed and how many you added.

### 3. `lib/data/ananta/provenance.ts`

The heart of your session.

```ts
export function fieldSource(record: ExperienceV2, field: ProvenancedField): Sourced<unknown> | null;
export function resolveProvenance(field: ProvenancedField, basis: Basis): { provenance: Provenance; confidence: Confidence };
```

Define a `Basis` union describing where a value actually came from, and map it to
provenance and confidence **by rule, not by hand, per record**. The rules, in
order of authority:

- Hand-authored by a human from local knowledge, cross-checked: `curated` +
  `verified`.
- Submitted by a provider through the form: `provider` + `community`, with the real
  submitted URL, and `asOf` set.
- Matched to an OSM element: `osm` + `verified` for name, category and coordinates.
  For everything else OSM does not carry, this does not apply.
- **Derived from a hash, a template, or an area-centre pin: `inferred` + `estimate`,
  with a low `score`, and an honest `note` saying so in plain words.**
- Computed from other known facts: `derived`.

The rule that changes the product: **a value produced by `hash(id) % band` is
`inferred` + `estimate`, never `curated`.** The current code labels 1064 records
`"Curated record"` while every price and duration on them is a hash. That single
mislabelling is the difference between an honest dataset and a fabricated one, and
session 4's scoring depends on it, because `estimate` prices must contribute zero to
the value component.

### 4. `lib/data/ananta/records.ts` and `enrich()`

```ts
export const anantaRecords: ExperienceV2[];
export const curatedRecordIds: ReadonlySet<string>;
export function enrich(base: Experience, now: string): ExperienceV2;
```

- `now` is a **parameter**. No `Date.now()` anywhere. The dataset must be
  byte-identical across runs or session 6's drift test and the geocode CI both
  become flaky.
- Real travel times, not `4 + (hash % 46)`. `lib/routing.ts` already has an OSRM
  client and an honest straight-line fallback at `routing.ts:183`. Reuse the
  fallback's arithmetic offline, at build time, and mark the result
  `derived` + `estimate`. A hash is not a travel time, and the current
  `travelMinutes` is enforced as a hard constraint by `plan.ts:60`, so a green
  "Feasible" badge today means nothing about the traveller's actual day.
- `openingHours`: for records you have curated, real weekly windows. For the rest,
  `confidence: "unverified"` and no windows. **That is the correct output**, and it
  is what makes session 3's `hours_unverified` rejection meaningful instead of a
  guess. Do not invent hours to make a demo look complete. An honest
  "unverified, so we will not claim it is open" is a *better* demo than a
  fabricated 10am to 7pm.
- `capacity`, `access`, `diet`, `indoor`, `kidFriendly`, `season`: `null` or absent
  where unknown. Same reasoning. `null` means unknown and the gate abstains.
- **`sourceUrl` is `string | null`.** `null` when there is no real source. **Zero
  `example.com` anywhere**, and a test asserting it. Also fix
  `lib/seed.ts:29` and `factory.ts:153`? No, `lib/seed.ts` is frozen. So: never
  copy the `demoSource` helper, and record in your blockers file that
  `lib/seed.ts:29` and `factory.ts:153` must be deleted by whoever owns them once
  session 9 cuts over to `anantaRecords`.
- Every field gets a provenance entry. A missing entry is a test failure, not a
  silent `undefined`.
- Keep the four v1 display fields working: `imageUrl`, `imageCredit`, `status`,
  `statusTone`, `updated`. Session 9's UI reads them.

### 5. `lib/data/curated/*.ts` — the Experience layer

The masterplan calls for about 250 hand-authored records with the fields OSM lacks.
Write them **area by area**, one file per zone group, using a consistent shape:

```ts
export interface CuratedFacts {
  id: string;
  durationMinutes: number;
  priceInr: number;
  pricePerPersonInr: number | null;
  capacity: number | null;
  openingHours: { weekly: WeeklyHours; confidence: Confidence };
  access: Partial<Record<AccessNeed, boolean>>;
  diets: DietNeed[];
  indoor: IndoorOutdoor;
  kidFriendly: boolean | null;
  season: SeasonWindow | null;
  bestTimeOfDay: "morning" | "afternoon" | "evening" | "night" | "any";
  ratingSum: number | null;
  reviewCount: number | null;
  authenticity: number | null;
  crowdProfile: number | null;
  asOf: string;
  reviewerNote: string;
}
```

Target the areas with the best existing OSM coverage first, so the curated facts and
the real coordinates coincide and the demo is coherent. `reviewerNote` is a plain
sentence saying how you know, which is what the provenance popover shows.

**Be honest in the numbers you write.** If you do not know the capacity, write
`null`. A curated record with a confident wrong capacity is worse than one that
abstains, because the gate will trust it.

### 6. `lib/data/dataset.test.ts` — fix the red suite and add the missing guards

Existing assertions to keep: per-category minimum, total minimum, unique ids,
coordinate bounds, the 3.5 km geocode proximity rule, media URL shapes, per-area
video uniqueness.

Add:

1. **Every area key in every `places/*.ts` file exists in `zoneRows`.** Prevents
   the silent drop.
2. **No `example.com` in `anantaRecords`**, and every non-null `sourceUrl` has a
   real registrable domain.
3. **Every `ProvenancedField` has a provenance entry on every record.** A missing
   one fails.
4. **No record has `provenance[field] === "curated"` for a field whose value came
   from `enrich`'s hash path.** Test by asserting the count of `curated` entries per
   field is at most the size of `curatedRecordIds`, except for name, area, zone,
   station and city.
5. **A record is not in Mumbai and Navi Mumbai simultaneously**, and its `area` is
   one of the manifest neighbourhoods. The current test only checks the metro bbox,
   so a Colaba venue pinned to Bandra is green.
6. **No duplicate `(area, coordinates)` pair within 30 m**, so two records cannot be
   the same physical place.
7. **Every `openingHours.confidence === "unverified"` record has no weekly
   windows**, and vice versa. Prevents a record claiming both ignorance and a
   schedule.
8. `bestTimeOfDay` coverage: report the count. Do not assert 100%, because a
   long tail honestly lacking guidance is correct. Assert it is greater than 0 and
   that the count is reported, so a regression to zero is visible.
9. `npm test` is green. **This is the headline deliverable of your session.** Run
   it and paste the real output in your summary. Do not claim it passes without
   having run it.

### 7. Geocoding integrity, without breaking the offline guarantee

- Do **not** make the app fetch anything at build time or runtime. The committed
  snapshot is the reason the demo never needs the network, and that is a strength.
- Fix `scripts/geocode-overpass.ts` so its pruning also removes ids that no longer
  correspond to any place, not only rows out of radius. That is the stale-row rot.
- Add an **identity check** to the dataset test for the existing snapshot, so the 35
  wrong-venue pins become visible: for each geocoded row, assert the matched OSM
  name shares at least one significant token with the place name, using the same
  generic-word exclusion list as `geocode-overpass.ts:89-96`. Rows that fail should
  be **listed in a report, not auto-deleted**, and the honest move is to drop the
  match and fall back to the area-centre pin, which is already labelled honestly.
- Note in your blockers file that regenerating with the strict Overpass matcher is a
  network operation that belongs in the monthly CI workflow, not in this session.
  Say exactly which command the maintainer should run.
- `scripts/verify-media.mjs:50` fetches only `iiprop=url`. Add `extmetadata` and
  capture the real `Artist` and `LicenseShortName`, so `imageCredit` stops being
  the literal string `"Wikimedia Commons contributor"` on all 70 images. This is a
  licensing-compliance fix, not cosmetics: Commons attribution requires naming the
  author. Since you cannot run the network here, write the code, write the test that
  asserts no credit equals that placeholder string, and put the regeneration command
  in your blockers file.

## Constraints

- **Zero new dependencies.**
- **Determinism is a correctness property.** `enrich(base, now)` with the same `now`
  must produce deep-equal output. A test asserts it.
- No em dash (U+2014), no emoji in any string or comment you write.
- **Do not run `npm ci` in a way that rewrites `package-lock.json`.** It is owned by
  session 10.

## Verification

```
npm ci
npx tsc --noEmit
npm run lint
npx vitest run lib/data
```

`npm test` in full, and paste the real summary line. A green suite is a headline
deliverable, not a footnote.

## Definition of done

1. `npm test` is green, verified by running it, with the output quoted.
2. Culture and Nature are both at 100 or more, with real names, and the
   `Breach Candy` zone row exists with real coordinates.
3. A test asserts every `places/*.ts` area key resolves in `zoneRows`.
4. Zero `example.com` in `anantaRecords`, proven by a test.
5. No hash-derived value is labelled `curated`, proven by a test.
6. `sourceUrl` is `null` or a real domain, per field, per record.
7. Unknown fields are `null` or `unverified`, never invented. At least one record
   must have `openingHours.confidence === "unverified"` so the abstention path is
   exercised by real data and not only by fixtures.
8. The geocode identity report names every wrong-venue pin, and those rows are
   either corrected or demoted to the area-centre pin with honest labelling.
9. `verify-media.mjs` captures real author and licence, and a test asserts no
   image credit equals the placeholder.
10. `enrich` is deterministic, proven by a test.
11. Your summary states plainly: how many records are real, how many are labelled
    estimates, how many fields remain unknown, and what you deliberately did not
    invent. **That paragraph is the most valuable thing you produce.**
