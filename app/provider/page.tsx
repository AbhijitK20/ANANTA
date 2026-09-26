"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  BookmarkSimple,
  CheckCircle,
  EnvelopeOpen,
  Storefront,
  TrendUp,
  Warning,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import { StatusLabel } from "@/components/ui";
import { providerAlerts } from "@/lib/alerts";
import {
  createRequest,
  listingDemand,
  normaliseUrl,
  openRequestCount,
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
import { LocalDemoNotice } from "@/components/ananta/provider/local-demo-notice";
import { UnmetDemandFeed } from "@/components/ananta/provider/unmet-demand-feed";
import { ListingForm } from "@/components/provider/listing-form";
import { CellFact, DataTable, TableAction, TableSelect, type TableRow } from "@/components/workspace/data-table";
import { BackLink, DashboardFrame, SectionHead, SheetBar, StatGrid, StatTile } from "@/components/workspace/frame";

/**
 * The provider workspace, as an operator's dashboard: a header that says what
 * this surface is, four real counts, then the three queues a provider actually
 * works in.
 *
 * Unmet demand is first, because the feed is the part that matters: it is the
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
  const refusalTotal = useMemo(
    () => ownDemand.reduce((total, signal) => total + signal.hits, 0),
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
    setRequests(
      createRequest({ providerId: listing.id, travellerId: "traveller-on-this-device", recordId, message }, today),
    );
  };

  /** The listings table. Availability is a control, so it lives in its own column. */
  const listingRows: TableRow[] = listings.map((listing) => {
    const signal = ownDemand.find((entry) => entry.id === listing.id) ?? null;
    return {
      id: listing.id,
      cells: [
        <div key="Listing" className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusLabel tone={listing.status === "Published" ? "green" : "blue"}>{listing.status}</StatusLabel>
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
              {listing.category}
            </span>
            {listing.status === "Published" && !listing.verified ? (
              <span className="chip border border-dashed border-muted bg-canvas text-muted">
                Opening hours unverified
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-bold text-ink">{listing.name}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted">
            {listing.area} &middot; updated {listing.updated}
          </p>
          {listing.sourceUrl ? (
            <a
              href={listing.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs font-semibold text-blue"
            >
              Your link
            </a>
          ) : (
            <p className="mt-1 text-xs font-semibold text-muted">No link given</p>
          )}
        </div>,
        <CellFact key="Price" label="Price">
          {listing.priceInr === null ? (
            <span className="text-muted">Not on record</span>
          ) : listing.priceInr === 0 ? (
            "Free"
          ) : (
            inr(listing.priceInr)
          )}
        </CellFact>,
        <CellFact key="Duration" label="Duration">
          {listing.durationMinutes === null ? (
            <span className="text-muted">Not on record</span>
          ) : (
            `${listing.durationMinutes} min`
          )}
        </CellFact>,
        <CellFact key="Refused by the gate" label="Refused by the gate">
          {/* Zero reads as zero. There is no floor and no rounding. */}
          {signal ? `${signal.hits} time${signal.hits === 1 ? "" : "s"}` : <span className="text-muted">0 times</span>}
          {signal && signal.rejections.length > 0 ? (
            <span className="mt-1 block text-xs font-normal leading-5 text-muted">
              Most often: {signal.rejections[0]?.sentence}
            </span>
          ) : null}
        </CellFact>,
        <TableSelect
          key="Availability"
          label={`Availability for ${listing.name}`}
          value={listing.availability}
          onChange={(value) => updateAvailability(listing.id, value as ProviderListing["availability"])}
        >
          <option>Open</option>
          <option>Limited</option>
          <option>Closed</option>
        </TableSelect>,
      ],
    };
  });

  /** The request inbox. A message is not a booking, and the row says so. */
  const requestRows: TableRow[] = requests.map((request) => ({
    id: request.id,
    cells: [
      <div key="Request" className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusLabel
            tone={request.state === "accepted" ? "green" : request.state === "declined" ? "amber" : "blue"}
          >
            {request.state}
          </StatusLabel>
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
            Opened {request.createdAt}
          </span>
          {request.respondedAt ? (
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
              Answered {request.respondedAt}
            </span>
          ) : (
            <span className="chip border border-dashed border-muted bg-canvas text-muted">
              Awaiting your answer
            </span>
          )}
        </div>
        <p className="mt-2 text-sm leading-6 text-ink">{request.message}</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          From {request.travellerId} about {request.recordId}. This is a message. It is not a booking,
          it is not a payment, and accepting it commits nobody to anything.
        </p>
      </div>,
      <CellFact key="About" label="About">
        {request.recordId}
      </CellFact>,
      <CellFact key="Opened" label="Opened">
        {request.createdAt}
      </CellFact>,
    ],
    actions:
      request.state === "open" ? (
        <>
          <TableAction tone="confirm" onClick={() => answer(request.id, "accepted")}>
            <CheckCircle size={15} aria-hidden="true" /> Accept
          </TableAction>
          <TableAction onClick={() => answer(request.id, "declined")}>
            <XCircle size={15} aria-hidden="true" /> Decline
          </TableAction>
        </>
      ) : undefined,
  }));

  return (
    <DashboardFrame width="workspace">
      <SheetBar>
        <BackLink href="/" label="Ananta" />
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Provider workspace</p>
          <h1 className="mt-1 text-lg font-bold text-ink">Manage your local listings</h1>
        </div>
      </SheetBar>

      <section className="px-5 pb-12 pt-8 sm:px-8 lg:px-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0">
            <LocalDemoNotice variant="provider" />

            <div className="mt-4">
              <StatGrid>
                <StatTile
                  icon={Storefront}
                  label="Listings"
                  value={listings.length}
                  note={`${listings.filter((listing) => listing.status === "Published").length} published, ${
                    listings.filter((listing) => listing.status === "Under review").length
                  } awaiting an operator`}
                />
                <StatTile
                  icon={BookmarkSimple}
                  label="Open requests"
                  value={openRequestCount(requests)}
                  note={
                    openRequestCount(requests) === 0
                      ? "Nothing is waiting for an answer"
                      : "Messages that have not been accepted or declined"
                  }
                />
                <StatTile
                  icon={TrendUp}
                  label="Refusals against your listings"
                  value={refusalTotal}
                  note={
                    refusalTotal === 0
                      ? "The gate has not refused any of your listings on this device"
                      : "Real refusals, counted once each, with no floor"
                  }
                />
                <StatTile
                  icon={EnvelopeOpen}
                  label="Grouped demand"
                  value={demand.length}
                  note={`${rows.length} recorded refusal${rows.length === 1 ? "" : "s"} on this device`}
                />
              </StatGrid>
            </div>

            {/* Unmet demand first, because it is the part that earns the page. */}
            <section className="mt-10" aria-labelledby="demand-heading">
              <SectionHead
                id="demand-heading"
                eyebrow="Unmet demand"
                title="What travellers wanted, and what stopped them"
                description="Every row below is a refusal the feasibility gate actually produced on this device. The sentence naming the blocking constraint is the gate's own, not a paraphrase, and the count is a real count with no floor under it."
              />
              <div className="mt-4">
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
              </div>
            </section>

            <section className="mt-10" aria-labelledby="listings-heading">
              <SectionHead
                id="listings-heading"
                eyebrow="Your experiences"
                title="The three facts the gate reads"
                description="Availability, price and duration are the fields the feasibility gate checks against a traveller's window and budget. Change one and it takes effect on this device immediately, with no publish step."
              />

              {alerts.length > 0 ? (
                <section
                  aria-label="Signals about your listings"
                  className="card mt-4 p-5"
                >
                  <div className="flex items-center gap-2">
                    <Bell size={18} className="text-blue" aria-hidden="true" />
                    <h3 className="text-sm font-bold text-ink">Signals about your listings</h3>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Each line below cites the signal it came from. A refusal count comes from the
                    gate reading your listing facts, and an age comes from the date on your record.
                  </p>
                  <ul className="mt-4 grid gap-2">
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
                          <span className="font-bold text-ink">{alert.title}.</span> {alert.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <div className="mt-4">
                <DataTable
                  label="Listings on this device"
                  note="Availability reaches the gate immediately, with no publish step."
                  columns={[
                    { head: "Listing" },
                    { head: "Price", secondary: true },
                    { head: "Duration", secondary: true },
                    { head: "Refused by the gate", secondary: true },
                    { head: "Availability" },
                  ]}
                  rows={listingRows}
                  empty={
                    <p className="text-sm leading-6 text-muted">
                      No listings on this device. Submit one in the form and it appears here
                      immediately, in a state that says it has not been published yet.
                    </p>
                  }
                />
              </div>
            </section>

            <section className="mt-10" aria-labelledby="requests-heading">
              <SectionHead
                id="requests-heading"
                eyebrow="Requests"
                title="What travellers asked you for"
                description="A request is a message. It is not a booking, not a payment, and not a commitment on either side. There is no payment flow, no commission and no dispute handling anywhere in this product, by decision. Accepting one records your answer with a date and nothing more."
              />
              <div className="mt-4">
                <DataTable
                  label="Request inbox"
                  note={`${requests.length} request${requests.length === 1 ? "" : "s"} on this device.`}
                  columns={[{ head: "Request" }, { head: "About", secondary: true }, { head: "Opened", secondary: true }]}
                  rows={requestRows}
                  empty={
                    <p className="text-sm leading-6 text-muted">
                      No requests on this device. Open one from the unmet-demand feed above and it
                      lands here, unanswered, until you accept or decline it.
                    </p>
                  }
                />
              </div>
            </section>
          </div>

          <ListingForm onSubmit={submitListing} submitted={submitted} />
        </div>
      </section>
    </DashboardFrame>
  );
}
