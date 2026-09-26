"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  CheckCircle,
  Clock,
  EnvelopeOpen,
  MapPin,
  Plus,
  Storefront,
  Warning,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import { StateNote, StatusLabel } from "@/components/ui";
import { providerAlerts } from "@/lib/alerts";
import {
  createRequest,
  listingDemand,
  normaliseUrl,
  parseDuration,
  parsePrice,
  providerListingSeed,
  readDemandRows,
  readProviderListings,
  readProviderRequests,
  respondToRequest,
  setListingAvailability,
  writeProviderListings,
  writeProviderRequests,
  type DemandRow,
  type ProviderListing,
  type ProviderRequest,
} from "@/lib/provider";
import { readOperations, writeOperations } from "@/lib/operations";
import { unmetDemandFromRows } from "@/lib/eval/unmet-demand";
import { TONE_TEXT, typeScale } from "@/components/ananta/tokens";
import { LocalDemoNotice } from "@/components/ananta/provider/local-demo-notice";
import { UnmetDemandFeed } from "@/components/ananta/provider/unmet-demand-feed";

/**
 * The provider workspace. Listings, the request inbox, and the unmet-demand
 * feed as the first block, because the feed is the part that matters: it is the
 * only reason a provider would look at this page on a Tuesday.
 *
 * Four claims this page used to make without backing them up, and what replaced
 * them:
 *
 * - "An admin must verify it before publishing" implied a publish path existed.
 *   It did not. The admin console now has one, and the wording here points at it.
 * - The old page counted saves and called `Math.max(counts[id], 4)` to trip its
 *   own `saves >= 3` alert. That was invented data wearing a real-looking
 *   number. Zero now reads as zero.
 * - The `price` and `duration` inputs were `required`, browser-validated, shown
 *   to the provider, and then discarded. They are stored now.
 * - `TODAY` was a frozen literal, so every freshness alert was decorative. The
 *   date comes from data now.
 *
 * The `Math.max` fix matters beyond this file. A demand feed that inflates
 * itself teaches a provider to disbelieve every number in it, which defeats the
 * purpose of building the feed at all.
 */

const inr = (value: number): string => `\u20b9${value.toLocaleString("en-IN")}`;

export default function ProviderPage() {
  const [listings, setListings] = useState<ProviderListing[]>(providerListingSeed);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [rows, setRows] = useState<DemandRow[]>([]);
  const [requests, setRequests] = useState<ProviderRequest[]>([]);
  /* The browser's own date, read once at mount. Every freshness comparison on
     this page is measured against it, so the numbers move with the clock
     instead of standing still. */
  const [today] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });

  const syncListings = useCallback(() => setListings(readProviderListings()), []);
  const syncRows = useCallback(() => setRows(readDemandRows()), []);
  const syncRequests = useCallback(() => setRequests(readProviderRequests()), []);

  useEffect(() => {
    syncListings();
    syncRows();
    syncRequests();
    window.addEventListener("ananta-provider-change", syncListings);
    window.addEventListener("ananta-demand-change", syncRows);
    window.addEventListener("ananta-requests-change", syncRequests);
    return () => {
      window.removeEventListener("ananta-provider-change", syncListings);
      window.removeEventListener("ananta-demand-change", syncRows);
      window.removeEventListener("ananta-requests-change", syncRequests);
    };
  }, [syncListings, syncRows, syncRequests]);

  /** Real refusals for the listings this provider owns, read from the gate's stream. */
  const ownDemand = useMemo(() => listingDemand(rows, listings), [rows, listings]);

  /**
   * City-wide unmet demand, grouped by the same function the engine uses, so
   * the numbers here and the numbers in the eval report cannot disagree.
   */
  const demand = useMemo(() => unmetDemandFromRows(rows), [rows]);

  /**
   * A real count, or zero. The old version read `saves` and floored it at four.
   * There is no floor here and there is no `Math.max` anywhere on this page.
   */
  const refusals = useMemo(
    () => Object.fromEntries(ownDemand.map((signal) => [signal.id, signal.hits])),
    [ownDemand],
  );
  const topRejection = useMemo(
    () =>
      Object.fromEntries(
        ownDemand.filter((signal) => signal.rejections.length).map((signal) => [signal.id, signal.rejections[0]?.sentence ?? ""]),
      ),
    [ownDemand],
  );

  const alerts = useMemo(
    () =>
      providerAlerts({
        updated: Object.fromEntries(listings.map((listing) => [listing.id, listing.updatedAt])),
        availability: Object.fromEntries(listings.map((listing) => [listing.id, listing.availability])),
        refusals,
        topRejection,
        today,
      }),
    [listings, refusals, topRejection, today],
  );

  const submitListing = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) return;
    const listing: ProviderListing = {
      /* Derived from the name, not `Date.now()`. The same experience submitted
         twice is the same listing, so it lands in review once instead of
         creating a second identical queue row. */
      id: `draft-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "listing"}`,
      name,
      area: String(form.get("area") ?? "").trim(),
      category: String(form.get("category") ?? "Other"),
      status: "Under review",
      availability: "Open",
      updated: "Just now",
      updatedAt: today,
      /* Both stored. A blank price is unknown, not free, which is why `parsePrice`
         returns null rather than 0. */
      priceInr: parsePrice(String(form.get("price") ?? "")),
      durationMinutes: parseDuration(String(form.get("duration") ?? "")),
      sourceUrl: normaliseUrl(String(form.get("source") ?? "")),
      publishedAt: null,
      verified: false,
    };
    const nextListings = [listing, ...listings.filter((existing) => existing.id !== listing.id)];
    setListings(nextListings);
    writeProviderListings(nextListings);
    writeOperations([
      {
        id: `op-${listing.id}`,
        kind: "submission",
        title: listing.name,
        area: listing.area,
        source: listing.sourceUrl ?? "Provider form, no link given",
        status: "Needs review",
        detail: `${listing.category} provider submission. ${
          listing.priceInr === null && listing.durationMinutes === null
            ? "No price or duration was given, so the engine will treat both as unknown."
            : `Provider gave ${listing.priceInr === null ? "no price" : inr(listing.priceInr)} and ${
                listing.durationMinutes === null ? "no duration" : `${listing.durationMinutes} min`
              }.`
        } Publish it from the operations console to put it in Explore.`,
        lastChecked: "Not checked",
        listingId: listing.id,
      },
      ...readOperations().filter((record) => record.id !== `op-${listing.id}`),
    ]);
    setSubmitted(listing.name);
    event.currentTarget.reset();
  };

  const updateAvailability = (id: string, value: ProviderListing["availability"]) => {
    const nextListings = setListingAvailability(listings, id, value, today);
    setListings(nextListings);
    writeProviderListings(nextListings);
  };

  const answer = (id: string, state: "accepted" | "declined") => {
    const next = respondToRequest(requests, id, state, today);
    setRequests(next);
    writeProviderRequests(next);
  };

  const openRequest = (recordId: string, message: string) => {
    const listing = listings.find((candidate) => candidate.id === recordId);
    if (!listing) return;
    const next = createRequest(
      { providerId: listing.id, travellerId: "traveller-on-this-device", recordId, message },
      today,
    );
    setRequests(next);
  };

  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1320px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-2 text-sm font-bold">
            <ArrowLeft size={18} aria-hidden="true" /> Ananta
          </a>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Provider workspace</p>
            <h1 className="mt-1 text-lg font-bold">Manage your local listings</h1>
          </div>
        </header>

        <section className="px-5 pb-12 pt-8 sm:px-8 lg:px-14">
          <div className="grid gap-10 lg:grid-cols-[1fr_430px]">
            <div className="min-w-0">
              {/* The one display heading on this screen. */}
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Unmet demand</p>
              <h2 className="mt-3 text-[28px] font-bold leading-[34px] tracking-[-0.04em]">
                What travellers wanted, and what stopped them.
              </h2>
              <p className="mt-4 max-w-2xl text-[17px] leading-7 text-muted">
                Every row below is a refusal the feasibility gate actually produced on this device.
                The sentence naming the blocking constraint is the gate&apos;s own, not a paraphrase,
                and the count is a real count with no floor under it.
              </p>

              <UnmetDemandFeed
                demand={demand}
                totalRows={rows.length}
                scanning={false}
                onAsk={(item) =>
                  openRequest(
                    item.actionableFor[0] ?? item.fingerprint,
                    `Travellers searched for ${item.query || "something in " + item.area} and were blocked by: ${item.dominantRejection.sentence}`,
                  )
                }
              />

              <LocalDemoNotice variant="provider" className="mt-8" />

              <section className="mt-10" aria-labelledby="listings-heading">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Your experiences</p>
                <h2 id="listings-heading" className="mt-2 text-xl font-bold tracking-[-0.03em]">
                  The three facts the gate reads
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                  Availability, price and duration are the fields the feasibility gate checks against
                  a traveller&apos;s window and budget. Change one and it takes effect on this device
                  immediately, with no publish step.
                </p>

                {alerts.length > 0 && (
                  <section aria-label="Signals about your listings" className="mt-6 border border-line bg-canvas p-5">
                    <div className="flex items-center gap-2">
                      <Bell size={18} className="text-blue" aria-hidden="true" />
                      <h3 className="font-bold">Signals about your listings</h3>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Each line below cites the signal it came from. A refusal count comes from the
                      gate reading your listing facts, and an age comes from the date on your record.
                    </p>
                    <ul className="mt-4 space-y-2">
                      {alerts.map((alert) => (
                        <li key={alert.id} className="flex items-start gap-2 text-sm leading-6">
                          <span className="mt-0.5 shrink-0" aria-hidden="true">
                            {alert.severity === "attention" ? (
                              <Warning size={16} className="text-amber" />
                            ) : (
                              <Bell size={16} className="text-blue" />
                            )}
                          </span>
                          <span>
                            <span className="font-bold">{alert.title}.</span> {alert.detail}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <div className="mt-6 grid gap-3">
                  {listings.length === 0 ? (
                    <StateNote state="nothing-retrieved">
                      <p className="mt-3 text-sm leading-6 text-muted">
                        No listings on this device. Submit one in the form and it appears here
                        immediately, in a state that says it has not been published yet.
                      </p>
                    </StateNote>
                  ) : (
                    listings.map((listing) => (
                      <ListingCard
                        key={listing.id}
                        listing={listing}
                        demand={ownDemand.find((signal) => signal.id === listing.id) ?? null}
                        onAvailabilityChange={(value) => updateAvailability(listing.id, value)}
                      />
                    ))
                  )}
                </div>
              </section>

              <section className="mt-10" aria-labelledby="requests-heading">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blueSoft text-blue">
                    <EnvelopeOpen size={20} aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Requests</p>
                    <h2 id="requests-heading" className="mt-1 text-xl font-bold tracking-[-0.03em]">
                      What travellers asked you for
                    </h2>
                  </div>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                  A request is a message. It is not a booking, not a payment, and not a commitment on
                  either side. There is no payment flow, no commission and no dispute handling
                  anywhere in this product, by decision. Accepting one records your answer with a
                  date and nothing more.
                </p>
                <div className="mt-4 grid gap-3">
                  {requests.length === 0 ? (
                    <StateNote state="nothing-fits" className="max-w-2xl">
                      <p className="mt-3 text-sm leading-6 text-muted">
                        No requests on this device. Open one from the unmet-demand feed above and it
                        lands here, unanswered, until you accept or decline it.
                      </p>
                    </StateNote>
                  ) : (
                    requests.map((request) => (
                      <RequestCard key={request.id} request={request} onAnswer={answer} />
                    ))
                  )}
                </div>
              </section>
            </div>

            <ListingForm onSubmit={submitListing} submitted={submitted} />
          </div>
        </section>
      </div>
    </main>
  );
}

/* ── the submission form ───────────────────────────────────────────────────── */

const CATEGORIES = [
  "Workshop", "Food", "Culture", "Nature", "Shopping",
  "Nightlife", "Adventure", "Recreation", "Stay", "Family",
] as const;

function ListingForm({
  onSubmit,
  submitted,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitted: string | null;
}) {
  return (
    <form onSubmit={onSubmit} className="h-fit border border-line bg-canvas p-5 sm:p-7 lg:sticky lg:top-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blueSoft text-blue">
          <Plus size={21} aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">New listing</p>
          <h2 className="mt-1 text-xl font-bold tracking-[-0.03em]">Submit an experience</h2>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        <FormField name="name" label="Experience name" placeholder="Weekend pottery workshop" required />
        <FormField name="area" label="Area" placeholder="Vashi, Fort, Bandra" required />
        <label className="block text-sm font-semibold">
          Category
          <select
            name="category"
            className="mt-2 block w-full rounded border border-line bg-white px-3 py-3 text-sm outline-none focus:border-blue"
            defaultValue="Workshop"
          >
            {CATEGORIES.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <FormField name="price" label="Price in rupees" placeholder="700" inputMode="numeric" />
          <FormField name="duration" label="Duration in minutes" placeholder="120" inputMode="numeric" />
        </div>
        {/* Both optional, both stored. The sentence says what a blank one means,
            which is the difference between an honest field and a dead one. */}
        <p className="text-xs leading-5 text-muted">
          Both are optional and both are kept. Leave price blank if it varies: we record that as
          unknown rather than as free, and an unknown price can never pass the budget gate.
        </p>

        <FormField
          name="source"
          label="Your link"
          placeholder="https://your-site.example"
          type="url"
        />
      </div>

      <p className="mt-4 text-xs leading-5 text-muted">
        A submission does not reach travellers until an operator publishes it from the
        operations console. Until then it exists only on this device, and this page says so rather
        than implying it is live.
      </p>

      <button
        className="mt-6 w-full rounded bg-blue px-4 py-3 text-sm font-bold text-white hover:bg-[#1249ad]"
        type="submit"
      >
        Submit for review
      </button>

      {submitted && (
        <p className="mt-4 flex items-start gap-2 text-sm font-semibold leading-6 text-green">
          <CheckCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {submitted} is queued for an operator. It reaches Explore only once it is published.
          </span>
        </p>
      )}
    </form>
  );
}

function FormField({
  name,
  label,
  placeholder,
  type = "text",
  inputMode,
  required = false,
}: {
  name: string;
  label: string;
  placeholder: string;
  type?: string;
  inputMode?: "numeric";
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        name={name}
        type={type}
        inputMode={inputMode}
        required={required}
        placeholder={placeholder}
        className="mt-2 block w-full rounded border border-line bg-white px-3 py-3 text-sm outline-none focus:border-blue"
      />
    </label>
  );
}

/* ── one listing ───────────────────────────────────────────────────────────── */

function ListingCard({
  listing,
  demand,
  onAvailabilityChange,
}: {
  listing: ProviderListing;
  demand: { hits: number; rejections: { sentence: string }[] } | null;
  onAvailabilityChange: (value: ProviderListing["availability"]) => void;
}) {
  return (
    <article className="border border-line p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <StatusLabel tone={listing.status === "Published" ? "green" : "blue"}>{listing.status}</StatusLabel>
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{listing.category}</span>
            {listing.status === "Published" && !listing.verified && (
              <span className="rounded border border-dashed border-muted bg-canvas px-2 py-0.5 text-xs font-semibold text-muted">
                Opening hours unverified
              </span>
            )}
          </div>
          <h3 className="mt-3 text-lg font-bold leading-6">{listing.name}</h3>
          <p className={typeScale.meta + " mt-1 " + TONE_TEXT.muted}>
            {listing.area} · Updated {listing.updated}
          </p>
        </div>
        <Storefront size={24} className="shrink-0 text-muted" aria-hidden="true" />
      </div>

      {/* A definition list, because these are labelled facts and not a paragraph. */}
      <dl className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Price</dt>
          <dd className="mt-1 text-sm font-semibold">
            {listing.priceInr === null ? (
              <span className="text-muted">Not on record</span>
            ) : listing.priceInr === 0 ? (
              "Free"
            ) : (
              inr(listing.priceInr)
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Duration</dt>
          <dd className="mt-1 text-sm font-semibold">
            {listing.durationMinutes === null ? (
              <span className="text-muted">Not on record</span>
            ) : (
              `${listing.durationMinutes} min`
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Refused by the gate</dt>
          <dd className="mt-1 text-sm font-semibold">
            {/* Zero reads as zero. There is no floor and no rounding. */}
            {demand ? (
              <>
                {demand.hits} time{demand.hits === 1 ? "" : "s"}
              </>
            ) : (
              <span className="text-muted">0 times</span>
            )}
          </dd>
        </div>
      </dl>

      {demand && demand.rejections.length > 0 && (
        <p className="mt-3 text-sm leading-6 text-muted">Most often: {demand.rejections[0]?.sentence}</p>
      )}

      <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="grid gap-2 text-xs font-semibold text-muted">
          <span>
            <MapPin size={14} className="mr-1 inline" aria-hidden="true" />
            {listing.sourceUrl ? (
              <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue underline">
                Your link
              </a>
            ) : (
              "No link given"
            )}
          </span>
          <span>
            <Clock size={14} className="mr-1 inline" aria-hidden="true" />
            Availability reaches the gate immediately, with no publish step
          </span>
        </div>
        <label className="text-xs font-bold text-muted">
          Availability
          <select
            value={listing.availability}
            onChange={(event) => onAvailabilityChange(event.target.value as ProviderListing["availability"])}
            className="ml-2 rounded border border-line bg-white px-2 py-2 text-xs font-bold text-ink"
          >
            <option>Open</option>
            <option>Limited</option>
            <option>Closed</option>
          </select>
        </label>
      </div>
    </article>
  );
}

/* ── one request ───────────────────────────────────────────────────────────── */

function RequestCard({
  request,
  onAnswer,
}: {
  request: ProviderRequest;
  onAnswer: (id: string, state: "accepted" | "declined") => void;
}) {
  return (
    <article className="border border-line p-5">
      <div className="flex flex-wrap items-center gap-3">
        <StatusLabel
          tone={request.state === "accepted" ? "green" : request.state === "declined" ? "amber" : "blue"}
        >
          {request.state}
        </StatusLabel>
        <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
          Opened {request.createdAt}
        </span>
        {request.respondedAt ? (
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
            Answered {request.respondedAt}
          </span>
        ) : (
          <span className="rounded border border-dashed border-muted bg-canvas px-2 py-0.5 text-xs font-semibold text-muted">
            Awaiting your answer
          </span>
        )}
      </div>
      <p className="mt-3 text-sm leading-6 text-ink">{request.message}</p>
      <p className="mt-2 text-xs leading-5 text-muted">
        From {request.travellerId} about {request.recordId}. This is a message. It is not a booking,
        it is not a payment, and accepting it commits nobody to anything.
      </p>
      {request.state === "open" ? (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => onAnswer(request.id, "accepted")}
            className="inline-flex items-center gap-1 rounded bg-blue px-3 py-2 text-xs font-bold text-white"
          >
            <CheckCircle size={15} aria-hidden="true" /> Accept
          </button>
          <button
            onClick={() => onAnswer(request.id, "declined")}
            className="inline-flex items-center gap-1 rounded border border-line px-3 py-2 text-xs font-bold"
          >
            <XCircle size={15} aria-hidden="true" /> Decline
          </button>
        </div>
      ) : null}
    </article>
  );
}
