# Blockers

Append-only. One file per session: `1.md` through `10.md`.

Never edit or delete another session's entries. Never rewrite your own: append a new
entry with a fresh timestamp. Concurrent appends from ten sessions are the intended
usage of this directory and the only shared write surface in the plan.

Format, from `00-CONTRACTS.md` section 8:

```md
## <iso-timestamp> <one-line summary>
- blocked on: <path>:<line>
- symptom: <exact error text or wrong behaviour>
- why i cannot fix it: <owned by session N>
- proposed one-line fix: <the diff you want that owner to apply>
- severity: blocker | degraded | cosmetic
```

Severity meanings:

- **blocker** — the task cannot be completed without this. Say so plainly. Do not
  build a local substitute.
- **degraded** — worked around, at a cost. Name the cost.
- **cosmetic** — noticed, not worth interrupting anyone.
