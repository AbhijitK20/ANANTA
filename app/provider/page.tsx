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
  ShieldWarning,
  Storefront,
  Warning,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import { StatusLabel } from "@/components/ui";
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

/**
 * The provider workspace: listings, real demand, and a request inbox.
 *
 * Three things changed here and each one is a correction of a claim the page used
 * to make without backing it up:
 *
 * - The demand figures are read from the persisted rejection stream, which is
 *   written by the real feasibility gate. The old page counted saves and then
 *   called `Math.max(counts[id], 4)` to trip its own `saves >= 3` alert. That was
 *   a fabricated number wearing a real-looking one, and it is gone.
 * - The form's price and duration are stored on the listing. They used to be
 *   `required`, browser-validated, shown to the provider, and then discarded.
 * - `TODAY` is passed in from the browser's own date at render, not frozen in the
 *   source, so the freshness alerts actually move.
 *
 * There is no backend and no authentication on this page. It writes
 * `localStorage` on the visitor's own device and nothing leaves it. That is a
 * deliberate scope decision and the page says so in the open.
 */

function todayStamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const inr = (value: number): string => `\u20b9${value.toLocaleString("en-IN")}`;

export default function ProviderPage() {
  const [listings, setListings] = useState<ProviderListing[]>(providerListingSeed);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [rows, setRows] = useState<DemandRow[]>([]);
  const [requests, setRequests] = useState<ProviderRequest[]>([]);
  const [today] = useState(todayStamp);

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

  const refusals = useMemo(
    () => Object.fromEntries(ownDemand.map((signal) => [signal.id, signal.hits])),
    [ownDemand],
  );
  const topRejection = useMemo(
    () =>
      Object.fromEntries(
        ownDemand
          .filter((signal) => signal.rejections.length)
          .map((signal) => [signal.id, signal.rejections[0]?.sentence ?? ""]),
      ),
    [ownDemand],
  );

  const alerts = useMemo(
    () =>
      providerAlerts({
        updated: Object.fromEntries(listings.map((listing) => [listing.id, listing.updatedAt])),
        availability: Object.fromEntries(
          listings.map((listing) => [listing.id, listing.availability]),
        ),
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
      // Derived from the name, not Date.now(): the same experience submitted
      // twice is the same listing, so it lands in review once instead of twice.
      id: `draft-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "listing"}`,
      name,
      area: String(form.get("area") ?? "").trim(),
      category: String(form.get("category") ?? "Other"),
      status: "Under review",
      availability: "Open",
      updated: "Just now",
      updatedAt: today,
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
        } Publish it from the operations queue to put it in Explore.`,
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

  const ask = (recordId: string, message: string) => {
    const listing = listings.find((candidate) => candidate.id === recordId);
    if (!listing) return;
    const next = createRequest(
      {
        providerId: listing.id,
        travellerId: "traveller-on-this-device",
        recordId,
        message,
      },
      today,
    );
    setRequests(next);
  };

  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1320px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-2 text-sm font-bold">
            <ArrowLeft size={18} /> Ananta
          </a>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Provider workspace</p>
            <h1 className="mt-1 text-lg font-bold">Manage your local listings</h1>
          </div>
        </header>
        <section className="px-5 pb-12 pt-10 sm:px-8 lg:px-14">
          <div className="grid gap-10 lg:grid-cols-[1fr_430px]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Your experiences</p>
              <h2 className="mt-3 text-4xl font-bold tracking-[-0.05em]">Keep the details current.</h2>
              <p className="mt-4 max-w-2xl leading-7 text-muted">
                Availability, price, and duration are the three facts that decide whether a
                recommendation survives the feasibility gate. Update them and the change is live on
                this device immediately.
              </p>

              <p className="mt-5 flex max-w-2xl items-start gap-2 border border-line bg-[#fbfcfd] p-3 text-xs leading-5 text-muted">
                <ShieldWarning size={16} className="mt-0.5 shrink-0 text-amber" />
                <span>
                  This workspace has no accounts and no server. Everything you type is written to this
                  browser only, and anyone with this device can change it. That is a deliberate demo
                  scope, not a hardened surface. See <code className="font-bold">docs/03-technical/ARCHITECTURE-ACTUAL.md</code>.
                </span>
              </p>

              {alerts.length > 0 && (
                <section aria-label="Demand alerts" className="mt-6 border border-line bg-[#fbfcfd] p-5">
                  <div className="flex items-center gap-2">
                    <Bell size={18} className="text-blue" />
                    <h3 className="font-bold">Signals about your listings</h3>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Every number below is a recorded count: refusals come from the feasibility gate
                    reading your listing facts, and no figure here is rounded up to look better.
                  </p>
                  <ul className="mt-4 space-y-2">
                    {alerts.map((alert) => (
                      <li key={alert.id} className="flex items-start gap-2 text-sm leading-6">
                        <span className="mt-0.5 shrink-0">
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

              <div className="mt-8 space-y-3">
                {listings.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    demand={ownDemand.find((signal) => signal.id === listing.id) ?? null}
                    onAvailabilityChange={(value) => updateAvailability(listing.id, value)}
                  />
                ))}
              </div>

              <section className="mt-10">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blueSoft text-blue">
                    <EnvelopeOpen size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Requests</p>
                    <h2 className="mt-1 text-xl font-bold">What travellers asked you for</h2>
                  </div>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                  Requests, not bookings. There is no payment, no commission, and no dispute flow
                  anywhere in this product, by decision. Accept or decline, and the traveller sees
                  your answer with a timestamp.
                </p>
                <div className="mt-4 space-y-3">
                  {requests.length === 0 && (
                    <p className="border border-line bg-canvas p-5 text-sm text-muted">
                      No requests yet. Open one from the unmet demand feed below.
                    </p>
                  )}
                  {requests.map((request) => (
                    <RequestCard key={request.id} request={request} onAnswer={answer} />
                  ))}
                </div>
              </section>

              <section className="mt-10">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amberSoft text-amber">
                    <Warning size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber">
                      Unmet demand
                    </p>
                    <h2 className="mt-1 text-xl font-bold">What people wanted and could not get</h2>
                  </div>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                  This feed is built from the rejection stream the feasibility gate writes, grouped so
                  repeated searches collapse into one row. The single constraint named first is the
                  one that killed it most often. The full distribution is behind it, because one cause
                  is rarely the whole story.
                </p>
                {rows.length === 0 ? (
                  <p className="mt-4 border border-line bg-canvas p-5 text-sm text-muted">
                    Nothing has been refused on this device yet, so there is no demand to show. That
                    is the honest state, not an empty state we are hiding. An operator can generate
                    real refusals from the live gate in the operations queue.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-3">
                    {demand.map((item) => (
                      <article key={item.id} className="border border-line p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <StatusLabel tone={item.actionableFor.length ? "amber" : "blue"}>
                              {item.area}
                            </StatusLabel>
                            <h3 className="mt-3 text-lg font-bold">
                              {item.query || "A general search in this area"}
                            </h3>
                            <p className="mt-1 text-sm text-muted">
                              {item.demandCount} traveller{item.demandCount === 1 ? "" : "s"} wanted
                              this and could not get it.
                            </p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
                              The one thing that blocked it
                            </p>
                            <p className="mt-1 max-w-xs text-sm font-semibold text-ink">
                              {item.dominantRejection.sentence}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 border-t border-line pt-3">
                          <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
                            Full distribution
                          </p>
                          <ul className="mt-2 flex flex-wrap gap-2">
                            {item.rejectionMix.map((entry) => (
                              <li
                                key={entry.code}
                                className="rounded bg-canvas px-2 py-1 text-xs font-semibold text-muted"
                              >
                                {entry.code.replace(/_/g, " ")} x{entry.count}
                              </li>
                            ))}
                          </ul>
                        </div>
                        {item.actionableFor.length > 0 ? (
                          <div className="mt-4">
                            {listings
                              .filter((listing) => item.actionableFor.includes(listing.id))
                              .map((listing) => (
                                <button
                                  key={listing.id}
                                  onClick={() =>
                                    ask(
                                      listing.id,
                                      `Travellers searched for ${item.query || "something in " + item.area} and were blocked by: ${item.dominantRejection.sentence}`,
                                    )
                                  }
                                  className="mr-2 mt-2 rounded-lg border border-line px-3 py-2 text-xs font-bold"
                                >
                                  Ask travellers about {listing.name}
                                </button>
                              ))}
                          </div>
                        ) : (
                          <p className="mt-4 text-xs text-muted">
                            No provider can act on this one from the catalogue, because the blocker is
                            weather, season, distance or the traveller&apos;s own party rather than
                            anything a venue controls.
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <form onSubmit={submitListing} className="h-fit border border-line bg-[#fbfcfd] p-5 sm:p-7">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blueSoft text-blue">
                  <Plus size={21} />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">New listing</p>
                  <h2 className="mt-1 text-xl font-bold">Submit an experience</h2>
                </div>
              </div>
              <div className="mt-6 space-y-4">
                <Field name="name" label="Experience name" placeholder="Example: Weekend pottery workshop" />
                <Field name="area" label="Area" placeholder="Vashi, Fort, Bandra" />
                <label className="block text-sm font-semibold">
                  Category
                  <select
                    name="category"
                    className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-3 text-sm outline-none focus:border-blue"
                    defaultValue="Workshop"
                  >
                    {[
                      "Workshop",
                      "Food",
                      "Culture",
                      "Nature",
                      "Shopping",
                      "Nightlife",
                      "Adventure",
                      "Recreation",
                      "Stay",
                      "Family",
                    ].map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <Field name="price" label="Price" placeholder="700" />
                  <Field name="duration" label="Duration in minutes" placeholder="120" />
                </div>
                <p className="text-xs leading-5 text-muted">
                  Both are optional and both are stored. Leave price blank if it varies; we will record
                  it as unknown rather than as free.
                </p>
                <Field name="source" label="Source URL" placeholder="https://your-site.example" type="url" />
              </div>
              <p className="mt-4 text-xs leading-5 text-muted">
                A submission is not discoverable until an operator publishes it from the operations
                queue. Until then it exists only on this device, and the page will say so rather than
                imply it is live.
              </p>
              <button
                className="mt-6 w-full rounded-lg bg-blue px-4 py-3 text-sm font-bold text-white hover:bg-[#1249ad]"
                type="submit"
              >
                Submit for review
              </button>
              {submitted && (
                <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-green">
                  <CheckCircle size={17} /> {submitted} is queued. An operator publishes it from the
                  operations queue, and only then does it reach Explore.
                </p>
              )}
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({
  name,
  label,
  placeholder,
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-3 text-sm outline-none focus:border-blue"
      />
    </label>
  );
}

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
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusLabel tone={listing.status === "Published" ? "green" : "blue"}>
              {listing.status}
            </StatusLabel>
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
              {listing.category}
            </span>
            {!listing.verified && listing.status === "Published" && (
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-amber">
                Facts unverified
              </span>
            )}
          </div>
          <h3 className="mt-4 text-xl font-bold">{listing.name}</h3>
          <p className="mt-1 text-sm text-muted">
            {listing.area} · Updated {listing.updated}
          </p>
        </div>
        <Storefront size={24} className="text-muted" />
      </div>
      <dl className="mt-5 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Price</dt>
          <dd className="mt-1 font-semibold">
            {listing.priceInr === null ? "Not on record" : listing.priceInr === 0 ? "Free" : inr(listing.priceInr)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Duration</dt>
          <dd className="mt-1 font-semibold">
            {listing.durationMinutes === null ? "Not on record" : `${listing.durationMinutes} min`}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Refused by the gate</dt>
          <dd className="mt-1 font-semibold">
            {demand ? `${demand.hits} time${demand.hits === 1 ? "" : "s"}` : "0 times"}
          </dd>
        </div>
      </dl>
      {demand && demand.rejections.length > 0 && (
        <p className="mt-3 text-sm leading-6 text-muted">
          Most often: {demand.rejections[0]?.sentence}
        </p>
      )}
      <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex flex-wrap gap-4 text-xs font-semibold text-muted">
          <span>
            <MapPin size={14} className="mr-1 inline" />
            {listing.sourceUrl ? (
              <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue underline">
                Provider link
              </a>
            ) : (
              "No provider link given"
            )}
          </span>
          <span>
            <Clock size={14} className="mr-1 inline" />
            Availability reaches the gate immediately
          </span>
        </div>
        <label className="text-xs font-bold text-muted">
          Availability
          <select
            value={listing.availability}
            onChange={(event) => onAvailabilityChange(event.target.value as ProviderListing["availability"])}
            className="ml-2 rounded-lg border border-line bg-white px-2 py-2 text-xs font-bold text-ink"
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
        {request.respondedAt && (
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
            Answered {request.respondedAt}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm leading-6 text-ink">{request.message}</p>
      <p className="mt-2 text-xs text-muted">
        From {request.travellerId} about {request.recordId}. This is a message, not a booking and not
        a payment.
      </p>
      {request.state === "open" && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => onAnswer(request.id, "accepted")}
            className="inline-flex items-center gap-1 rounded-lg bg-blue px-3 py-2 text-xs font-bold text-white"
          >
            <CheckCircle size={15} /> Accept
          </button>
          <button
            onClick={() => onAnswer(request.id, "declined")}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold"
          >
            <XCircle size={15} /> Decline
          </button>
        </div>
      )}
    </article>
  );
}
