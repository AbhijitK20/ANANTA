# SESSION 3 of 10 — The Feasibility Gate and Typed Rejections

> Copy everything below this line into a new session.

---

You are session 3 of 10 working simultaneously on **ANANTA**, a fit-first local
discovery engine at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

**You are building the thesis.** Everything else in this engine exists to feed you.
A recommendation that does not fit is not a recommendation, and the ability to say
exactly why it does not fit, in a finished sentence with a real number, is the one
thing a judge cannot get from a ChatGPT wrapper.

## Read first

1. `MASTERPLAN.md` sections 3 and 3.1.
2. `SESSION/00-CONTRACTS.md` **completely**. Sections 0, 2, 4 (your signatures), 5
   (rejection code discipline) and 8 are binding.
3. `lib/engine/contracts/codes.ts` if session 1 has landed it. It is the only place
   a rejection sentence may come from. If it is not there yet, code against the
   `RejectionCode` union in section 2 of the contracts file and import
   `REJECTION_CODES` from `@/lib/engine/contracts`; it will resolve.
4. `lib/quick-filters.ts` (the existing ad hoc gate) and
   `lib/recommendation.ts:34-51` (the existing inline gate).

## The defect you are replacing

The product currently emits **15 untyped English strings** as `string[]`. Only
**3** carry a numeric shortfall. None has a stable code. They are not composable,
so a record failing both time and budget produces two unlabelled strings and there
is no way to ask which constraint was binding. Four tests across
`lib/recommendation.test.ts` and `lib/quick-filters.test.ts` assert on that prose,
which means the wording is load bearing and nobody can change it.

Two specific bugs you must not carry forward:

- `lib/recommendation.ts:45` treats `statusTone === "amber"` as "Weather
  dependent". But `statusTone` is a 3-value **presentation token** being used as a
  **constraint bit**, and seven records are amber for three different reasons: four
  genuinely weather dependent, two "Seasonally reachable", and
  `belapur-fort-history-walk` which is amber because it says "Awaiting operator
  check". So a history walk gets rejected on a rainy day for wanting a phone call.
  `lib/recommendation.test.ts:33` locks the bug in with a loop over all amber
  records. **Do not port this.** Use `record.indoor` and `record.season`.
- `lib/quick-filters.ts` runs as a **second** gate *after* ranking, so excluded
  records get scored, sorted, and their score thrown away. Gate before score, always.
  The caller is session 9's problem, but your `gate()` is the only gate.

## ALLOWED — you own these files, exclusively

```
lib/engine/feasibility/checks/iso.ts
lib/engine/feasibility/checks/time.ts
lib/engine/feasibility/checks/hours.ts
lib/engine/feasibility/checks/money.ts
lib/engine/feasibility/checks/capacity.ts
lib/engine/feasibility/checks/access.ts
lib/engine/feasibility/checks/diet.ts
lib/engine/feasibility/checks/availability.ts
lib/engine/feasibility/checks/weather.ts
lib/engine/feasibility/checks/season.ts
lib/engine/feasibility/checks/plan-state.ts
lib/engine/feasibility/checks/index.ts
lib/engine/feasibility/gate.ts
lib/engine/feasibility/sentence.ts
lib/engine/feasibility/feasibility.ts
lib/engine/feasibility/index.ts
lib/engine/feasibility/*.test.ts
SESSION/BLOCKERS/3.md
```

Splitting `checks/` into one file per concern is deliberate: it makes the
"cheapest first" ordering in the masterplan visible in the filesystem, and it keeps
each file small enough that session 9 can read one without reading eleven.

## FORBIDDEN

```
lib/engine/contracts/**      session 1
lib/engine/retrieve/**       session 2
lib/engine/scoring/**        session 4
lib/engine/packing/**        session 5
lib/engine/validation/**     session 6
lib/engine/replan/**         session 7
lib/engine/eval/**           session 10
lib/engine/index.ts          session 1
lib/seed.ts  lib/data/**     session 8 / frozen
app/**  components/**        sessions 9 and 10
lib/recommendation.ts  lib/quick-filters.ts        read-only, do not migrate
lib/recommendation.test.ts  lib/quick-filters.test.ts   read-only, do not migrate
docs/**  scripts/**  .github/**
package.json  tsconfig.json  .eslintrc.json  vitest.config.ts  next.config.mjs
```

You are **not** migrating the old gate. Session 9 rewires the UI to your `gate()`
and rewrites the four prose-coupled assertions at the same time. Two sessions
editing `lib/recommendation.ts` in parallel is exactly the collision this plan
exists to prevent. Leave the legacy path intact and working until session 9 cuts
over, and note in your blockers file that `lib/recommendation.ts` becomes dead code
at that point.

## Task

### 1. `sentence.ts`

The only place that assembles a human sentence from a code plus numbers. It calls
`REJECTION_CODES[code].sentence(...)` from the contracts. It does not contain a
single English literal of its own except for joiners.

```ts
export function reject(
  code: RejectionCode,
  opts: { shortfall?: number; unit?: RejectionUnit; extra?: string },
  cause: { provenance: Provenance; confidence: Confidence },
): Rejection;
```

When `confidence === "unverified"`, the sentence must not assert the fact. It must
say we do not know. `"Seats 3; you are 4."` is fine.
`"Cannot confirm capacity, so we will not claim it fits 4."` is also fine, and is
the *correct* output when the field is unverified. A gate that guesses is worse
than a gate that abstains, and abstaining is a first-class outcome here: it is what
`unverified_required_fact` is for.

### 2. `checks/*.ts` — one file per concern, cheapest first

Each check is `(record, ctx, position) => Rejection[]`. It returns an **array**,
because a record can fail several ways and the traveller deserves to know all of
them, ranked. Return every failure, then let the gate sort by
`blocking` desc, then `shortfall` desc, then `code` asc.

| File | Checks | Notes |
|---|---|---|
| `iso.ts` | `too_far`, `no_route` | Travel time against `ctx.availableMinutes` share. Uses the isochrone basis from session 2's `retrieve/isochrone`, or accepts an injected travel-time function. **Do not import session 2's module**; take travel time as a parameter. Sessions 2 and 3 are parallel. |
| `time.ts` | `travel_time_exceeds_budget`, `duration_exceeds_budget` | `travel + duration + buffer <= availableMin`. **The buffer is a single shared constant.** Today `lib/recommendation.ts:37` hardcodes `+ 15` and `lib/plan.ts:39` hardcodes `15` as a default, and they agree by luck. Define `DEFAULT_BUFFER_MINUTES` once, here, export it, and note in a comment that session 9 must use this constant in the feasibility meter too. |
| `hours.ts` | `closed_now`, `closed_during_window`, `hours_unverified` | The visit window must be **entirely** inside an open window, not merely overlap it. Handle a window that crosses midnight. Handle `openingHours.confidence === "unverified"` as `hours_unverified`, which session 1 marks **advisory**, not blocking. |
| `money.ts` | `over_budget`, `over_budget_per_person` | `price x partySize <= budget`. Use `pricePerPersonInr` when present, else `priceInr` as the per-person figure, and be explicit in the sentence about which you used. When the price is `unverified`, abstain. |
| `capacity.ts` | `capacity_exceeded` | `capacity >= partySize`. `null` capacity means unknown, so abstain via `unverified_required_fact`, never assume it fits. |
| `access.ts` | `not_step_free`, `not_stroller_ok`, `no_accessible_restroom`, `requires_steps`, `no_seating`, `not_quiet_enough` | One check per `AccessNeed`. A `false` in `record.access` is a hard reject. A **missing key** is unknown, which abstains rather than rejects, unless the need is one the traveller marked as a hard requirement. Add a `ctx.profile`-level flag for that distinction and name it clearly. |
| `diet.ts` | `diet_mismatch` | Only when `ctx.diets` is non-empty. A record with no diet information abstains. |
| `availability.ts` | `sold_out`, `requires_booking_not_available`, `lead_time_too_short` | `lead_time_too_short` compares `availability.leadTimeMinutes` against the time between `ctx.now` and the planned arrival. |
| `weather.ts` | `weather_unsafe` | `record.indoor === "outdoor"` and `ctx.weatherSeverity` is `rain`, `heavy_rain` or `storm`. **`weatherSeverity === null` means unknown, which is not `false`.** Unknown weather must not reject outdoor records; it must mark them lower in the objective, which is session 4's job. Getting this backwards is how you build a product that lies. |
| `season.ts` | `seasonal_mismatch` | `record.season.months` against `ctx.city.monsoonMonths` and the month of `ctx.now`. This is the fix for the flamingo bug. |
| `plan-state.ts` | `duplicate`, `already_planned`, `excluded_by_traveller` | `duplicate` is proximity to an existing stop within `city.duplicateRadiusKm` from the manifest, not a string comparison. |

### 3. `gate.ts`

```ts
export function gate(records, ctx, options): GateResult;
export function dominantRejection(rejections: Rejection[]): Rejection | null;
```

- Run the checks in the **cheapest-first order above**, short-circuiting on the
  first *blocking* rejection per record so the common case does not evaluate twelve
  files. But still collect the non-blocking ones, because `hours_unverified` on a
  record that also fails on time is useful context.
- `options.windowFor(record)` gives the visit window. Default it to
  "arrive as soon as travel allows, stay for `durationMinutes`".
- `GateResult.stream` is the flat rejection stream. **It is the raw material for
  the provider unmet-demand feed**, which session 10 builds. Emit every rejection
  for every rejected record, not a sample and not a summary. Session 10 depends on
  this being complete.
- `dominantRejection` returns the single most frequent **blocking** code, and
  breaks ties by total shortfall desc then code asc. This is the "which single
  constraint killed it" answer the provider feed leads with. All-or-nothing:
  no blocking rejections means `null`, never a guess.

### 4. `feasibility.ts`

Module-level convenience: `feasible(records, ctx)` for the one-shot case, and
`feasibilityMeter(stops, ctx)` returning `{ activityMin, travelMin, bufferMin,
usedMin, remainingMin, overflow }`. Session 9 needs the meter shape now, so export
the type even though the UI is not yours.

## Constraints

- **Zero new dependencies.**
- **Purity.** No `Date.now()`, no `Math.random()`, no `fetch`. Take `now` from
  `ctx.now`. Session 1's guard test is watching the whole tree.
- **Every sentence comes from `REJECTION_CODES`.** No English literals for
  rejections anywhere in your files. A test will grep for this.
- `shortfall` is always positive, always in `unit`, and `unit: "none"` implies
  `shortfall: null`.
- No em dash (U+2014), no emoji. No Mumbai string in `lib/engine/`.

## Verification

```
npm ci
npx tsc --noEmit
npm run lint
npx vitest run lib/engine/feasibility
```

## Definition of done

1. **Every one of the 30 codes has a test that produces it.** Table-driven, one
   row per code, with a minimal record and context that triggers exactly that code.
   This is the single most important test you write: it is the proof that a
   rejection is a feature and not an error.
2. A test asserts that `belapur-fort-history-walk` style records, where
   `indoor === "indoor"` and the status was only "awaiting operator check", are
   **not** weather-rejected in rain. This is the regression guard for the bug the
   current test suite cements.
3. A test asserts a seasonal bird-watching point fails `seasonal_mismatch` out of
   season and **passes** the weather check in rain when `indoor === "outdoor"`.
4. A test asserts `weatherSeverity: null` does not reject an outdoor record.
5. A test asserts a record with `capacity: null` abstains rather than passes or
   fails.
6. A test asserts the buffer is counted exactly once, using a record whose
   `travel + duration` lands precisely on and precisely one minute over the limit.
7. A test asserts a record failing both time and budget returns both rejections,
   sorted blocking-first, with the binding one identifiable via `dominantRejection`.
8. A test asserts a visit window crossing midnight is evaluated correctly.
9. A test asserts `GateResult.stream` length equals the total rejection count
   across all rejected records. Session 10 is depending on this.
10. A test asserts the legacy `statusTone` field appears nowhere in your source.
