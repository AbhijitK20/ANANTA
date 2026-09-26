# ANANTA — Parallel Session Runner

Ten prompts, one working tree, zero file overlap. Read
[`00-CONTRACTS.md`](00-CONTRACTS.md) before launching anything.

## Launch order

All ten can start simultaneously. They cannot collide, because every cross-session
symbol is written out as compilable TypeScript in `00-CONTRACTS.md` and every file
has exactly one owner.

If your runner supports staggering, launch in this order anyway, because it makes
the merge easier to review:

```
1  01-PROMPT.md    contracts, types, no-model guard     keystone, everything imports it
2  02-PROMPT.md    retrieval, BM25, isochrone
3  03-PROMPT.md    feasibility gate, typed rejections   the thesis
4  04-PROMPT.md    scoring, the scalar objective        the number
5  05-PROMPT.md    packing, beam search and LAHC        kills the C(60,k) OOM
6  06-PROMPT.md    independent validation, ladder        the credibility anchor
7  07-PROMPT.md    replanning, intent preservation
8  08-PROMPT.md    data, provenance, 250 curated        the input to all of the above
9  09-PROMPT.md    traveller UI, feasibility meter      the thesis made visible
10 10-PROMPT.md    provider flywheel, eval, CI, docs    measurement and honesty
```

Sessions 1 to 7 do not need each other to finish. Sessions 9 and 10 have real
ordering constraints **inside** their own prompts and follow them.

## The three rules, in one line each

1. **You own a file list. You touch nothing else.** The `ALLOWED` list in your
   prompt is exhaustive. A file you do not own is being edited right now by someone
   else.
2. **Import inward.** `app/` to `lib/engine/index.ts` to a stage to
   `lib/engine/contracts/`. Stages import lower-numbered stages only. One barrel,
   owned by session 1.
3. **Zero new dependencies, one owner per config file.** `package.json`,
   `tsconfig.json`, `.eslintrc.json`, `vitest.config.ts` and `next.config.mjs` belong
   to session 10 alone. `lib/seed.ts` belongs to nobody and is frozen.

## When you are blocked

Do not fix a file you do not own. Append to `BLOCKERS/<your session number>.md`:

```md
## <iso-timestamp> <one-line summary>
- blocked on: <path>:<line>
- symptom: <exact error text or wrong behaviour>
- why i cannot fix it: <owned by session N>
- proposed one-line fix: <the diff you want that owner to apply>
- severity: blocker | degraded | cosmetic
```

Append-only. Never rewrite another session's file. Severity `blocker` means you
cannot finish. Say so plainly instead of building a local shim, because ten local
shims is how ten sessions end up with ten divergent copies of the same idea.

## Verification, identical for every session

```bash
npm ci
npx tsc --noEmit        # other sessions' in-flight errors are expected. Filter to yours.
npm run lint
npx vitest run <your paths>
git status --short      # every path must be on your ALLOWED list
```

Sessions 8 and 10 additionally run the full suite and paste the real output:

```bash
npm test
npm run eval
```

## Merge order

1 through 8 in numeric order, then 9, then 10. Session 10 last because it owns the
config files, the CI pipeline, the docs and the final `noUncheckedIndexedAccess`
change, and because its Part 1 needs sessions 3 and 8 to have landed.

Expect to fix up imports in `lib/engine/index.ts` as the stages land. That is
session 1's file and session 1's job.

## What is already true, so nobody rediscovers it

- `npm test` is **red on `main`**. Culture has 90 records and Nature has 98 against
  a `>= 100` floor at `lib/data/dataset.test.ts:11`. Session 8 owns the fix.
- `lib/plan.ts:88-95` materialises C(60, k) combinations inside a `useMemo` on the
  render path. 5.46 million arrays at 5 stops. Session 5 owns the fix, session 9
  stops calling it.
- `sourceUrl` is `https://example.com/sources/<id>` on all 1107 records. Session 8
  owns the fix.
- All 70 images are credited `"Wikimedia Commons contributor"`, which is not an
  author. Session 8 owns the fix.
- Roughly 35 OSM pins point at the wrong venue, including a hospital pinned to a
  restaurant. Session 8 owns the report.
- `"Breach Candy"` is missing from `lib/data/zones.ts`, so 3 places are silently
  dropped. Session 8 owns the fix.
- The product has never had a plan generator. `lib/plan.ts` audits a hand-clicked
  list. Sessions 3 to 7 build the thing that builds one.
- The docs describe a product about ten times this size. Session 10 owns the fix,
  and it is almost all deletions.
