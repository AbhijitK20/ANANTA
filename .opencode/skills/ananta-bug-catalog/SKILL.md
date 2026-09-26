---
name: ananta-bug-catalog
description: The specific bug classes ANANTA has already shipped, with file and line references, so they are caught in review instead of rediscovered. Use when reviewing a diff, when touching lib/plan.ts, lib/factory.ts, lib/cluster.ts, lib/recommendation.ts, components/map.tsx, or any numeric parsing, Set iteration, or unbounded render. Triggers on "review this", "look for bugs", "is this correct", "why is this slow", "before I merge".
license: MIT
compatibility: opencode
metadata:
  project: ananta
  scope: review
---

# ANANTA bug catalog

Every entry here is a real defect found in this repository, with the location and
the reason it is easy to miss. Check for these by name during review. Each one
looks correct in isolation and is wrong in context, which is why it survived.

---

## 1. Exhaustive enumeration on a render path

`lib/plan.ts:88-95`, called from `app/trips/page.tsx:35` inside a `useMemo`.

```ts
for (let index = start; index <= items.length - (size - selected.length); index += 1)
  results.push(...choose(items, size, index + 1, [...selected, items[index]]));
```

Materialised combinations, each a distinct array, with `evaluatePlan` run on every
one:

| plan size | C(60, k) |
|---|---|
| 4 | 487,635 |
| 5 | 5,461,512 |
| 8 | 2,558,620,845 |

No cap on plan size anywhere. No test above k=2, which is why it shipped. A 5 stop
plan is a multi-second browser freeze on every budget-slider keystroke.

**Look for:** `C(n, k)`-shaped recursion, `results.push(...` inside a loop, and any
search in a `useMemo` or a `useEffect` that is not bounded and is not debounced.
The fix is beam search with an asserted call-count bound.

## 2. `Set` / `Map` iteration order in an objective

The objective must be bit-reproducible, because session 6 re-derives it and the two
must agree to `1e-6`. A `for...of` over a `Set`, or folding into a running
accumulator across one, makes the sum order-dependent and the drift bound
unachievable for reasons no test will explain.

**Look for:** `for (const x of someSet)`, `reduce` over a `Set`, or
`Object.values` on an object built by insertion. Sort first, then iterate. Assert
the objective is invariant to visitation order.

## 3. Deriving a measurement from a display string

`lib/plan.ts:30-32`:

```ts
return value === "Free" ? 0 : Number(value.replace(/[^0-9]/g, ""));
```

`"From 300"` becomes `300`, so a floor price is treated as the price.
`"Overnight"` and `"2 nights"` match neither `hour` nor `min`, so
`parseDurationMinutes` returns **0** and a 14,000-rupee two-night stay contributes
zero minutes of activity time. The same regex is duplicated in
`app/explore/page.tsx:32-36` for `sortPrice`, with the same bug.

**Look for:** `replace(/[^0-9]/g`, `parseInt` on a formatted string, or any
feasibility decision derived from a value destined for display. The v2 record type
has real numeric fields precisely to prevent this.

## 4. A hash used as a physical measurement

`lib/data/factory.ts:85`:

```ts
travelMinutes: 4 + (hash(`${id}-travel`) % 46),
```

`hash` is a `*31 + charCode` accumulator at `:62-68`. A venue 14 km away can get 4
minutes; a Fort cafe can get 52. This value is what `plan.ts:60` gates
`feasible` on, so a green "Feasible" badge is a statement about a hash function.

Same pattern at `:83` (price), `:84` (duration), `:147` (`statusTone: "blue"` for
all 1064 records), and `:127` (`generatedImages[hash(id) % 70]`, so 15.8 venues
share one photo).

**Look for:** any `hash(` whose result feeds a gate, a score, a sort, or a
coordinate. A hash is fine for a stable id or a bucketed photo choice. It is never
fine for a quantity the product claims to have measured.

## 5. A presentation token used as a constraint bit

`lib/recommendation.ts:45`:

```ts
if (constraints.rainMode && experience.statusTone === "amber") hardFailures.push("Weather dependent");
```

`statusTone` is a three-value display token: `"blue" | "green" | "amber"`. Seven
records are amber for three unrelated reasons: four genuinely weather dependent,
two "Seasonally reachable" (flamingo points, `lib/seed.ts:67, 73`), and
`belapur-fort-history-walk` at `:72` which is amber because it says "Awaiting
operator check". So a history walk is rejected on a rainy day for wanting a phone
call.

Worse, `lib/recommendation.test.ts:32-34` loops over **all** amber records and
asserts the rejection, cementing the bug. Meanwhile `factory.ts:147` sets
`statusTone: "blue"` on 1064 unchecked records, so the rain gate is a no-op for 96%
of the catalogue while asserting they are not weather dependent.

**Look for:** a field named `tone`, `status`, `variant`, `theme` or `badge` read
inside a conditional that changes behaviour. And read the tests: a test that
enumerates a set to assert a uniform outcome is often a bug with a test on top.

## 6. A gate that runs after ranking

`app/explore/page.tsx:94-97`:

```ts
result = recommendExperiences(...)                      // gate + score, fused
quick  = applyQuickFilters(result.ranked.map(...))      // SECOND gate
visibleRanked = result.ranked.filter(keptIds)
```

Excluded records get scored, sorted, and their score discarded. The order is
reversed: gate before score, always. The fusion is the deeper problem, because you
cannot instrument "what did the gate remove" separately from "what did the score
remove", and you cannot re-score a kept set without re-gating.

## 7. `.find()` on the full catalogue, presented as a recommendation

`app/trips/page.tsx:94`:

```ts
allExperiences.find((item) => item.statusTone !== "amber" && !ids.includes(item.id))?.id
```

First match in array order. Ignores location, category, budget, time and the plan's
area. For any user not already planning `kala-ghoda-art-walk` the "suggested
indoor alternative" is index 0 of the array. The card then asserts at `:132` that
it "keeps the rest of the plan within the current area".

**Look for:** `Array.find` or `[0]` used to make a product decision, where a scored
candidate set existed. Also `.find` inside `.map`, which is `O(n²)`.

## 8. `O(n²)` in a loop, and clustering that disappears

`lib/cluster.ts:37` does `items.find(...)` inside a `.map(...)`, roughly 1.1M
operations per re-cluster, and `components/map.tsx:88` re-runs the effect on every
zoom change.

Worse, `lib/cluster.ts:12-17` returns `undefined` cell size at **zoom >= 14**,
which disables clustering entirely and yields all ~1107 points, one DOM
`maplibregl.Marker` each with a click listener and a Popup. `components/map.tsx:92`
calls `flyTo({ zoom: 13 })`, one step away. A multi-second freeze on a mid-range
laptop.

**Look for:** `find` or `filter` inside `map` or `forEach`, and any threshold that
switches a feature off rather than tuning it.

## 9. Unbounded render

`app/explore/page.tsx:238` maps every excluded record with no cap. With a loose
filter set that is about 1000 divs. The list itself is fine, by contrast:
`PAGE_SIZE = 24` at `:19` means at most 24 cards ever mount. Keep that discipline
and apply it to the rejection list.

## 10. Unescaped HTML over machine-rewritten data

`components/map.tsx:59` and `:83`:

```ts
.setHTML(`<strong>${experience.name}</strong><br/><span>${experience.area} · ${experience.price}</span>`)
```

1107 venue names into an `innerHTML` sink, unescaped. Not exploitable today, the
names are literals. But `.github/workflows/refresh-geocode.yml` rewrites that data
from Overpass every month, so one future name containing `<` breaks it, and there
is no CSP to catch it.

**Look for:** `setHTML`, `innerHTML`, `dangerouslySetInnerHTML`, or template
interpolation into markup. `setDOMContent` with real nodes, or `new
maplibregl.Popup().setText()`, which escapes for you.

## 11. A test that cannot fail

`lib/recommendation.test.ts:17-26`:

```ts
for (const { experience, reasons } of result.ranked) {
  const excluded = result.excluded.find((item) => item.experience.id === experience.id);
  expect(excluded).toBeUndefined();
  void reasons;                    // the author knew it proved nothing
}
```

A record can never be in both `ranked` and `excluded` because `:48-50` excludes and
`continue`s. The test titled "includes travel and buffer in the available-time
constraint" does not verify that travel and buffer are included.

**Look for:** `void x` after an assertion, `expect(x).toBeDefined()` where the type
already guarantees it, assertions on the *absence* of something a prior line already
excluded, and `toBeTruthy()` on a shape rather than a value.

## 2. The dead assertion in reverse

Four tests assert on **rejection prose** rather than a code:
`lib/recommendation.test.ts:14` expects the string `"Outside Mumbai"`,
`lib/quick-filters.test.ts:22` expects `"Not flagged as a hidden gem"`. The
English sentence is therefore the de-facto identifier, and rewording it or
localising the UI breaks CI with a confusing failure.

**Look for:** `expect(...).toContain("some English sentence")`. Assert on a
discriminant (`code`, `id`, a numeric value) and let the sentence be presentation.

## 3. Computed but discarded

- `app/explore/page.tsx:221` renders `reasons.slice(0, 3)` and the score computed
  at `lib/recommendation.ts:73` is **never shown**. Rank 1 is not evidenced.
- `lib/plan.ts:52` computes `bufferMinutes`. `app/trips/page.tsx:81` merges it into
  one "Travel and buffer" tile. The buffer is a signature part of the feasibility
  meter and it is invisible.
- `app/admin/operations/page.tsx:43` writes `status: "Verified"`, and nothing in
  `recommendExperiences` or `evaluatePlan` reads it.
- `lib/media.ts:21` computes `embedUrl` and `components/experience-media.tsx:44`
  links to `item.href` instead.
- `lib/seed.ts:16` `mediaTitle` is populated on every record and rendered nowhere.

**Look for:** a value assigned to a variable and then unused, a metric computed for
a report nobody reads, and a status field that no consumer queries. Dead signals
are worse than absent ones, because the UI claims they work.

## 4. Hardcoded environment

- `app/provider/page.tsx:11`, `const TODAY = "2026-09-09"`, so every freshness alert
  at `lib/alerts.ts:30-37` is decorative.
- `scripts/qa-browser-pass.mjs:5` and `scripts/qa-audit-fixes.mjs:5` both
  `require("/home/abhijitk20/plugins/playwright-cli/node_modules")`, one
  developer's home directory. `playwright` is not in `package.json`. Port hardcoded
  to 3117. Screenshots to `/tmp`. Unrunnable on any clean checkout.
- `scripts/qa-audit-fixes.mjs:20-25` calls `process.exit` before
  `await browser.close()`, leaking a Chromium process on every failure.
- `.env.example` line 1: `NEXT_PUBLIC_APP_NAME=Local Tourist`, a name from before
  the rename, and 9 of its 10 variables are read by nothing.

**Look for:** a date literal, an absolute home path, a hardcoded port, and an env
var that no source file references. `grep -rn "process.env" app/ lib/ components/`
is the check.

## 5. Local-only assumptions presented as shared

`/provider` and `/admin/operations` mutate `localStorage` with no authentication,
no authorization, no rate limiting and no CSRF token, while `PRD.md:158` promises
"role-based authorization, validation, rate limiting, secure sessions".

For a device-local demo that is defensible. **Saying which it is, in the docs and
in the UI, is not optional.** A public deployment is a different product.

**Look for:** a security claim in a document with no corresponding mechanism, and
`localStorage` used as a system of record.

---

## Review pass, in order

1. `git diff --stat`. Is every path on the author's `ALLOWED` list?
2. Grep the diff for: `hash(`, `replace(/[^0-9]/g`, `Math.max(`, `Date.now()`,
   `Math.random()`, `setHTML`, `innerHTML`, `.find(` inside `.map(`, `Array.from({length`,
   recursive `results.push(...`.
3. Grep for `statusTone`, `sourceUrl ===`, `example.com`, `TODO`, `FIXME`, `void `.
4. Every new number: which field is it, and what is that field's provenance?
5. Every new sentence: which function produced the claim?
6. Every new test: can it fail? Would it fail if the feature were deleted?
7. `npx tsc --noEmit` scoped to the changed paths, then `npm run lint`, then
   `npx vitest run` on the touched modules.
