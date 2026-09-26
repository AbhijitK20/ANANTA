# SESSION 10 of 10 — Provider, Admin, Legal, and the Loop That Is Severed

> Copy everything below this line into a new session.

---

You are session 10 of 10 in the **spatial UI round** on **ANANTA**, at
`C:\Games\Projects\Projects for GITHUB\HackCelestial\ANANTA`.

You own the supply side, the operator console, the legal pages, and the sentence that
tells a visitor what this application is not. **The provider loop is severed at
exactly one step, and closing it is the highest-value single change in this
session.**

## The 3D rule for this screen: real, because a business user is checking trust

Everywhere else in the product, depth encodes epistemic status. Here it is
**commercial status**, which is the same grammar:

| State | Depth |
|---|---|
| published and discoverable | `depth-raised` |
| pending verification | `depth-flush`, with an age |
| rejected, with a stated reason | `depth-recessed`, dashed, reason on the row |
| stale, and genuinely removed from ranking | `depth-recessed` plus an explicit "removed from ranking" label |

**The last row matters most.** The current tooltip says "Remove from ranking until
checked" and nothing reads it. A recessed card that still returns results is a lie
in three dimensions. Either it actually stops returning, or it does not claim to.

## Read first

1. `UI-UX-Fix-Prompts/00-CONTRACTS.md` **completely**. Section 3 copy rules, section
   6 for the status grammar, your row in section 10.
2. `SESSION/UI-UX-DESIGN.md` sections 3, 5, 6.5 and 9.
3. `MASTERPLAN.md` section 7, the provider side, and section 9, the non-goals.
4. `lib/eval/unmet-demand.ts`, your own work from the previous round and the data
   source for the whole feature.
5. `app/provider/page.tsx` (9626 bytes), `app/admin/operations/page.tsx` (13KB),
   `app/terms/page.tsx`, `app/privacy/page.tsx`, `lib/provider.ts`, `lib/alerts.ts`,
   `lib/operations.ts`, `lib/media-store.ts`, `lib/reports.ts`.
6. `docs/04-data/HIDDEN-GEM-POLICY.md`,
   `docs/05-design/TERMS-AND-CONDITIONS-REQUIREMENTS.md`,
   `docs/05-design/PRIVACY-POLICY-REQUIREMENTS.md`.

## ALLOWED — you own these, exclusively

```
app/provider/**
app/admin/**
app/terms/**
app/privacy/**
components/ananta/provider/**
UI-UX-Fix-Prompts/BLOCKERS/10.md
```

## FORBIDDEN

```
tailwind.config.ts, app/globals.css, tokens.ts, records.ts, lib/ui-guard/**     session 1
components/ananta/pipeline.ts, use-ananta.ts                                    session 2
app/layout.tsx, app/page.tsx, app/contact/**, footer.tsx, ui.tsx                 session 3
app/explore/**, map.tsx, discovery-search.tsx, travel-options.tsx                session 4
app/trips/**, components/ananta/feasibility-meter.tsx                           session 5
app/experience/**, provenance-badge.tsx, experience-media.tsx, report-button.tsx           session 6
components/ananta/why-this.tsx, why-this-live.tsx, why-not-that.tsx, learning.ts,
  plan-button.tsx, plan-badge.tsx, save-button.tsx, share-button.tsx             session 7
components/ananta/stress-radar.tsx, learned-weights.tsx, app/profile/**, app/saved/**     session 8
components/ananta/replan.ts, replan-proposal.tsx, app/events/**, availability-picker.tsx   session 9
lib/**   FROZEN
package.json, next.config.mjs, tsconfig.json, .eslintrc.json, vitest.config.ts, docs/**
```

New components go in `components/ananta/provider/`. Yours alone.

## Task

### 1. Close the loop, or say plainly that it is open

**The provider page promises something the admin page cannot deliver.**
`app/provider/page.tsx:93` tells a provider: *"An admin must verify it before
publishing"* and *"Availability becomes a real discovery signal once an admin
publishes the listing."*

The admin page at `app/admin/operations/page.tsx:67` offers only **Verify** and
**Mark stale**, and both write a `status` string that **nothing in discovery ever
reads**. No publish action, no listing queue, no link to submissions. A submitted
listing stays invisible to Explore forever.

**An operator can "verify" a thousand records and not one traveller-facing signal
changes.** The tooltip claims Mark stale means "Remove from ranking until checked",
which is false.

Build the publish action: a listing queue, a real publish that inserts into the
discoverable catalogue, and a stale state that genuinely removes from ranking. If
`statusTone` on a real record has to feed `gate()` for that, and the wiring needs a
field you do not own, **write a blocker with the exact diff you want.**

**Do not fake it by writing "published" into a localStorage key that nothing reads.**
That is the current failure mode and it is worse than an honest gap, because depth
makes a fake look even more settled than a flat fake.

### 2. The unmet-demand feed, and the fabricated number

**`app/provider/page.tsx:31` computes `Math.max(counts[listing.id], 4)`.** It
inflates every save count to a floor of 4, deliberately tripping the `saves >= 3`
alert at `lib/alerts.ts:45`. **That is invented data wearing a real-looking number,
and it is exactly what this product exists to avoid.** Delete it. If there are no
saves, show zero. Zero is fine.

The feed is the economic argument of the whole project, so it is the **top block**,
not a tab. Each row states:

- **What travellers nearby searched for.** Verbatim, escaped for display.
- **That they could not get it**, with a count.
- **Which single constraint killed it**, in a finished sentence from the real
  `Rejection` builders via `dominantRejection`. Not a code, not a bar chart.
- **What relaxing it would unlock.** "Needs 40 min more than you have left. 12
  travellers were blocked by this in the last day."
- The full `rejectionMix` behind the dominant one, so the provider sees a shape and
  not a single cause.

`lib/eval/unmet-demand.ts` computes all of this. **Wire the UI to it.** If the
rejection stream is not persisted anywhere yet, that is the missing data source and
it is the most important thing on this page: **nothing anywhere logs a search**, so
the feed has nothing to show until that exists.

**Depth on the feed is real, and it is the one place a magnitude-adjacent depth is
defensible**: a demand row's depth reflects how many travellers it would help. That
is a count, not a score, and it is the traveller's interest rather than the engine's
opinion. Say in your summary that this is the one exception, and why it does not
corrupt the grammar.

### 3. The form silently discards two of its own fields

`app/provider/page.tsx:52-63` reads only `name`, `area`, `category` and `source`.
The `price` and `duration` inputs at `:92` are `required`, browser-validated,
**shown to the user, and then thrown away.** Submissions get `id: draft-${Date.now()}`
and never enter the catalogue.

Honour them or remove them. A required field that is silently discarded costs a
user's trust, and it is what `DESIGN-CONTRACT.md:46` means by "all copy must be
specific and supported by actual functionality".

Also `:88` claims *"Update availability, capacity, and listing details"*. **There is
no `capacity` field on `ProviderListing`**, and listing details are immutable after
seed. And `:98` renders a hardcoded literal **"Service area confirmed"** with no
service-area data anywhere. Both are fabricated claims. Delete them, or implement
the field.

`const TODAY = "2026-09-09"` at `:11` means every freshness alert at
`lib/alerts.ts:30-37` is computed against a frozen date and is decorative. Take the
date as a parameter.

### 4. Security posture, stated where a user can see it

`/provider` and `/admin/operations` mutate persistent state with **no
authentication, no authorization, no rate limiting and no CSRF token**, and there is
no backend at all, only `localStorage`.

For a device-local demo that is legitimate. **Saying so is not optional.** A public
deployment is a different product, and `docs/01-product/PRD.md:158` promises
role-based authorization, validation, rate limiting and secure sessions for something
that does not exist. **Both pages must state that they are a local demo with no
accounts**, and the console must say that clearing site data erases everything.

There is no authentication this round and you are not building it. **You are making
the absence legible.** That is the whole job, and it is a design job, not a
engineering one.

### 5. The legal pages, honestly

`app/terms/page.tsx:1` and `app/privacy/page.tsx:1` both correctly say they *"must
receive legal review before public launch"*. **Keep that.** It is the right posture.

They are 1198 and 1376 bytes, so they are thin. Within their existing scope:

- The privacy page must cover what is actually stored: the plan under `ananta-*`
  keys, saves, reports, operations records, provider listings, media records, the
  bandit state from session 7, and two `sessionStorage` route caches. **Enumerate
  them from reality.** A privacy page listing the wrong data is worse than a short
  one.
- It must say there is no server, nothing is transmitted except routing and map
  requests, and what those third parties are.
- No invented legalese, no fake jurisdiction, no fake compliance claim.
- **Legal pages are `depth-recessed` and stay there.** They are context, not claim,
  and a recessed long-form page is also the most readable one.

### 6. `UiState` coverage

The provider and admin consoles need the honest ones, and they matter more here
because this is where a business user decides whether to trust you. An empty demand
feed is a real state with a real explanation: no searches have been recorded yet on
this device, and here is what would appear. A rejected submission needs a stated
reason. A pending verification needs its age.

**A `broken` state here is the one place it must say what data is at risk**, because
an operator action that appears to have worked when it did not is the worst failure
this console can have.

## Constraints

- **RULE 0: no engine in the view layer.** `dominantRejection`, `REJECTION_CODES`,
  `unmetDemandFromStream` come from `@/lib/engine` and `@/lib/eval`. Do not
  reimplement a rejection sentence on these pages.
- **Class names only.** No `style={{ transform }}`.
- Zero new dependencies. No auth library, no form library, no motion library. The
  form is a real `<form>` with `FormData` today and it should stay that simple.
- No em dash, no emoji, no hard-coded dataset number, and **no hard-coded demand
  number**, which is the same rule applied to the number currently invented.
- Never present a request as a booking, a payment or a commitment. `MASTERPLAN.md`
  section 9: no payments, no commission, no payouts, no disputes. Requests, not
  transactions.
- Every state claiming a provider did something must correspond to something a
  traveller can observe. **A dead signal is worse than a missing one**, because the
  UI asserts it works.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run lib/ui-guard lib/eval
npm run dev
```

Then: submit a listing, publish it, and **confirm it appears in Explore**. That
end-to-end path is the definition of done for this session. Then close the demand
feed and confirm the no-saves number reads zero, not four. Then mark a listing stale
and confirm it genuinely stops appearing in results, or delete the tooltip.

## Definition of done

1. A publish action exists and a published listing becomes discoverable. Verified by
   doing it.
2. Mark stale removes from ranking, or its tooltip is corrected.
3. `Math.max(counts[id], 4)` is gone. Zero reads as zero.
4. The unmet-demand feed is the top block, shows the dominant constraint as a real
   sentence, the count, the median shortfall, and what relaxing it would unlock.
5. The rejection stream is actually persisted, or the feed says plainly that no
   searches have been recorded on this device.
6. Price and duration are honoured or removed. No required field is discarded.
7. "Capacity", "listing details" and "Service area confirmed" are gone or
   implemented.
8. The frozen `TODAY` is gone; dates come from data.
9. Both consoles state there are no accounts and that clearing site data erases
   everything.
10. The privacy page enumerates the storage keys that actually exist.
11. No request is presented as a booking, a payment or a commitment.
12. The demand-row depth exception is documented in a comment, with the reason.
13. `git status --short` shows only your five path patterns.
14. Your summary states plainly whether the loop is closed, and if any part of it is
    not, exactly which step and why.
