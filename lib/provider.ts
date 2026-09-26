import type { ExperienceV2, Rejection, RejectionCode, RejectionUnit } from "@/lib/engine/contracts";

/**
 * The provider side's persistent state: listings, the rejection stream, and the
 * request inbox. `localStorage` under `ananta-*` keys, no backend, no auth, and
 * every surface that reads this says so in the UI.
 *
 * Three things live here that did not exist before, and each one closes a loop
 * the product previously only claimed to close:
 *
 * 1. **`recordDemandRows`.** The flywheel had no data source. The array the whole
 *    feed depends on used to be computed in memory in Explore and thrown away on
 *    navigation. This is the store that array was missing, and it is fed by the
 *    real gate, so a rejection a provider reads is a rejection the engine
 *    actually produced.
 * 2. **`applyPublishedListings`.** Publishing used to set a status string that
 *    nothing in discovery read, so a submitted listing stayed invisible forever.
 *    This is the function that makes a published listing appear, and the admin
 *    publish button calls it.
 * 3. **Requests.** Requests, not transactions. No payment, no commission, no
 *    dispute, per the masterplan's non-goals.
 */

export type ProviderAvailability = "Open" | "Limited" | "Closed";

export type ProviderListing = {
  id: string;
  name: string;
  area: string;
  category: string;
  status: "Published" | "Under review";
  availability: ProviderAvailability;
  updated: string;
  updatedAt: string;
  /**
   * What the provider actually told us, honoured instead of discarded. The form
   * has always asked for both; before this field existed they were browser
   * validated, shown to the provider, and then thrown away, which is a bug that
   * costs a user's trust.
   */
  priceInr: number | null;
  durationMinutes: number | null;
  /** `null` when the provider gave no link. Never a placeholder. */
  sourceUrl: string | null;
  /** ISO date the listing entered the discoverable catalogue, or `null`. */
  publishedAt: string | null;
  /** True when an admin has verified the facts, not just clicked a button. */
  verified: boolean;
};

export const providerListingSeed: ProviderListing[] = [
  {
    id: "matunga-breakfast-trail",
    name: "Matunga Breakfast Trail",
    area: "Matunga",
    category: "Food",
    status: "Published",
    availability: "Open",
    updated: "Today",
    updatedAt: "2026-09-26",
    priceInr: 550,
    durationMinutes: 90,
    sourceUrl: null,
    publishedAt: "2026-09-09",
    verified: true,
  },
  {
    id: "vashi-market-loop",
    name: "Vashi Market Loop",
    area: "Vashi",
    category: "Shopping",
    status: "Published",
    availability: "Limited",
    updated: "Yesterday",
    updatedAt: "2026-09-25",
    priceInr: 0,
    durationMinutes: 75,
    sourceUrl: null,
    publishedAt: "2026-09-08",
    verified: true,
  },
];

export const PROVIDER_LISTINGS_KEY = "ananta-provider-listings";
export const PROVIDER_OPERATIONS_KEY = "ananta-provider-operations";
export const DEMAND_ROWS_KEY = "ananta-demand-rows";
export const PROVIDER_REQUESTS_KEY = "ananta-provider-requests";

/* ── listings ─────────────────────────────────────────────────────────────── */

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null");
    return value === null ? fallback : (value as T);
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown, event: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(event));
}

/**
 * A listing written before this shape existed, or by an older build. Backfilled
 * rather than dropped: a provider who set availability last week should not lose
 * it because the record gained six fields.
 */
export function normaliseListing(raw: unknown): ProviderListing | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<ProviderListing> & Record<string, unknown>;
  if (typeof value.id !== "string" || !value.id) return null;
  const availability: ProviderAvailability =
    value.availability === "Closed" || value.availability === "Limited" ? value.availability : "Open";
  const number = (input: unknown): number | null =>
    typeof input === "number" && Number.isFinite(input) ? input : null;
  return {
    id: value.id,
    name: typeof value.name === "string" ? value.name : value.id,
    area: typeof value.area === "string" ? value.area : "Unspecified area",
    category: typeof value.category === "string" ? value.category : "Other",
    status: value.status === "Published" ? "Published" : "Under review",
    availability,
    updated: typeof value.updated === "string" ? value.updated : "Unknown",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "1970-01-01",
    priceInr: number(value.priceInr),
    durationMinutes: number(value.durationMinutes),
    sourceUrl: typeof value.sourceUrl === "string" && value.sourceUrl ? value.sourceUrl : null,
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : null,
    verified: value.verified === true,
  };
}

export function readProviderListings(): ProviderListing[] {
  const stored = readJson<unknown[]>(PROVIDER_LISTINGS_KEY, []);
  if (!Array.isArray(stored) || !stored.length) return providerListingSeed;
  const listings = stored.map(normaliseListing).filter((listing): listing is ProviderListing => Boolean(listing));
  return listings.length ? listings : providerListingSeed;
}

export function writeProviderListings(listings: ProviderListing[]): void {
  writeJson(PROVIDER_LISTINGS_KEY, listings, "ananta-provider-change");
}

export function providerAvailability(
  listings: readonly ProviderListing[],
): Record<string, ProviderAvailability> {
  return Object.fromEntries(listings.map((listing) => [listing.id, listing.availability]));
}

export function providerUpdatedDates(listings: readonly ProviderListing[]): Record<string, string> {
  return Object.fromEntries(listings.map((listing) => [listing.id, listing.updatedAt]));
}

/* ── the publish path ─────────────────────────────────────────────────────── */

/**
 * The change that turns the provider side from a form into a loop.
 *
 * `publishListing` moves a submission from `Under review` to `Published` and
 * stamps it. `applyPublishedListings` is what discovery reads, and it is a pure
 * function so a test can prove a published listing becomes discoverable and an
 * unpublished one does not.
 *
 * Two rules, both load-bearing:
 *
 * - A **published** listing whose id matches a catalogue record overrides that
 *   record's availability, price and duration. This is the existing
 *   `lib/provider.ts:35` to `lib/recommendation.ts:46` flow, kept.
 * - A **published** listing with no catalogue record is *added* to the
 *   catalogue. This is the part that did not exist: before it, a submitted
 *   listing stayed invisible to Explore forever no matter how many times an
 *   operator pressed Verify.
 *
 * `unverified` provenance is not available on the injected record shape, so a
 * submitted listing is marked `provider` + `community` in its `sources` map when
 * one is supplied, and `unverified` when it is not. The gate will refuse to treat
 * an unverified opening time as open, which is correct: the provider has not told
 * us when it is open, only that it exists.
 */
export function publishListing(
  listings: readonly ProviderListing[],
  id: string,
  now: string,
): ProviderListing[] {
  return listings.map((listing) =>
    listing.id === id
      ? { ...listing, status: "Published", publishedAt: now, updatedAt: now, updated: "Just now", verified: true }
      : listing,
  );
}

export function verifyListing(
  listings: readonly ProviderListing[],
  id: string,
  now: string,
): ProviderListing[] {
  return listings.map((listing) =>
    listing.id === id ? { ...listing, verified: true, updatedAt: now, updated: "Just now" } : listing,
  );
}

export function setListingAvailability(
  listings: readonly ProviderListing[],
  id: string,
  availability: ProviderAvailability,
  now: string,
): ProviderListing[] {
  return listings.map((listing) =>
    listing.id === id ? { ...listing, availability, updatedAt: now, updated: "Just now" } : listing,
  );
}

/**
 * Merge provider listings into a catalogue. Pure, so the whole claim "a published
 * submission becomes discoverable" is testable without a browser.
 *
 * `now` is injected for the same reason the engine injects `now`: nothing here
 * reads a clock, so the result is byte identical across runs.
 */
export function applyPublishedListings(
  records: readonly ExperienceV2[],
  listings: readonly ProviderListing[],
  now: string,
): ExperienceV2[] {
  const published = listings.filter((listing) => listing.status === "Published");
  if (!published.length) return records.slice();
  const byId = new Map(published.map((listing) => [listing.id, listing]));

  const merged: ExperienceV2[] = records.map((record) => {
    const listing = byId.get(record.id);
    if (!listing) return record;
    return {
      ...record,
      availability: {
        ...record.availability,
        remainingCapacity: listing.availability === "Closed" ? 0 : record.availability.remainingCapacity,
        updatedAt: listing.updatedAt,
      },
      status: listing.availability === "Closed" ? "Closed by provider" : record.status,
      statusTone: listing.availability === "Closed" ? "amber" : record.statusTone,
      priceInr: listing.priceInr ?? record.priceInr,
      durationMinutes: listing.durationMinutes ?? record.durationMinutes,
      confidence: {
        ...record.confidence,
        // A provider's own number is `community`, never `verified`. `verified`
        // means checked against a live source, and nobody checked this one.
        price: listing.priceInr === null ? record.confidence.price : "community",
        duration: listing.durationMinutes === null ? record.confidence.duration : "community",
      },
      provenance: {
        ...record.provenance,
        price: listing.priceInr === null ? record.provenance.price : "provider",
        duration: listing.durationMinutes === null ? record.provenance.duration : "provider",
      },
    };
  });

  const existing = new Set(records.map((record) => record.id));
  for (const listing of published) {
    if (existing.has(listing.id)) continue;
    merged.push(listingToRecord(listing, now));
  }
  return merged;
}

/**
 * A submitted listing, as a catalogue record.
 *
 * Everything the provider did not tell us is `null` or `unverified`, never a
 * guess. The gate is then free to refuse on `hours_unverified` and
 * `unverified_required_fact`, and it will say why, which is exactly what a
 * provider needs to hear: publish the hours and the listing becomes recommendable.
 */
function listingToRecord(listing: ProviderListing, now: string): ExperienceV2 {
  const unverified = { weekly: {}, confidence: "unverified" as const, asOf: listing.updatedAt };
  const sourceUrl = listing.sourceUrl;
  const provenance = {
    name: "provider" as const,
    coordinates: "inferred" as const,
    address: "inferred" as const,
    category: "provider" as const,
    duration: "provider" as const,
    price: "provider" as const,
    capacity: "inferred" as const,
    openingHours: "inferred" as const,
    accessibility: "inferred" as const,
    indoor: "inferred" as const,
    kidFriendly: "inferred" as const,
    booking: "provider" as const,
    seasonality: "inferred" as const,
    bestTime: "inferred" as const,
    diet: "inferred" as const,
    rating: "inferred" as const,
    reviewCount: "inferred" as const,
    media: "inferred" as const,
    pricePerPerson: "derived" as const,
  };
  const confidence = {
    name: "community" as const,
    coordinates: "unverified" as const,
    address: "unverified" as const,
    category: "community" as const,
    duration: listing.durationMinutes === null ? ("unverified" as const) : ("community" as const),
    price: listing.priceInr === null ? ("unverified" as const) : ("community" as const),
    capacity: "unverified" as const,
    openingHours: "unverified" as const,
    accessibility: "unverified" as const,
    indoor: "unverified" as const,
    kidFriendly: "unverified" as const,
    booking: "unverified" as const,
    seasonality: "unverified" as const,
    bestTime: "unverified" as const,
    diet: "unverified" as const,
    rating: "unverified" as const,
    reviewCount: "unverified" as const,
    media: "unverified" as const,
    pricePerPerson: listing.priceInr === null ? ("unverified" as const) : ("community" as const),
  };
  return {
    id: listing.id,
    name: listing.name,
    area: listing.area,
    city: "Mumbai",
    zone: listing.area,
    station: listing.area,
    category: listing.category,
    description: `Submitted by the provider on ${listing.updatedAt}. No operator description is on record yet.`,
    coordinates: [0, 0],
    travelMinutes: 0,
    durationMinutes: listing.durationMinutes ?? 60,
    priceInr: listing.priceInr ?? 0,
    pricePerPersonInr: listing.priceInr,
    capacity: null,
    openingHours: unverified,
    availability: {
      leadTimeMinutes: 0,
      soldOutAt: null,
      remainingCapacity: null,
      bookingUrl: null,
      updatedAt: listing.updatedAt,
    },
    access: {},
    diets: [],
    indoor: "mixed",
    kidFriendly: null,
    season: null,
    bestTimeOfDay: "any",
    ratingSum: null,
    reviewCount: null,
    authenticity: null,
    providerReliability: null,
    crowdProfile: null,
    provenance,
    confidence,
    sources: {
      name: {
        value: listing.name,
        provenance: "provider",
        confidence: "community",
        asOf: listing.updatedAt,
        sourceUrl,
        note: "Name typed by the provider in the listing form, not checked by an operator.",
      },
      price: {
        value: listing.priceInr,
        provenance: "provider",
        confidence: listing.priceInr === null ? "unverified" : "community",
        asOf: listing.updatedAt,
        sourceUrl,
        note: listing.priceInr === null
          ? "The provider did not enter a price, so it is unknown rather than free."
          : "Price typed by the provider. It is their claim, not a verified figure.",
      },
      duration: {
        value: listing.durationMinutes,
        provenance: "provider",
        confidence: listing.durationMinutes === null ? "unverified" : "community",
        asOf: listing.updatedAt,
        sourceUrl,
        note: listing.durationMinutes === null
          ? "The provider did not enter a duration, so the engine falls back to a default."
          : "Duration typed by the provider.",
      },
      openingHours: {
        value: null,
        provenance: "inferred",
        confidence: "unverified",
        asOf: listing.updatedAt,
        sourceUrl: null,
        note: "The provider has not published opening hours, so the gate will not claim it is open.",
      },
    },
    imageUrl: "",
    imageCredit: "",
    status: "Published by provider submission",
    statusTone: "blue",
    updated: listing.updated,
  };
}

/* ── the rejection stream, persisted ──────────────────────────────────────── */

/**
 * One record the gate refused, with the refusals. This is the row the provider
 * flywheel is built on, and it is the thing that did not exist before.
 *
 * `hits` counts how many times this record was refused for this set of reasons.
 * It is a real count: `recordDemandRows` increments it on a genuine repeat and
 * never floors it. The old page called `Math.max(counts[id], 4)` to trip its own
 * alert threshold, which is a fabricated number wearing a real-looking one.
 */
export type DemandRow = {
  id: string;
  area: string;
  query: string;
  interest: string;
  hits: number;
  rejections: Rejection[];
  firstSeenAt: string;
  lastSeenAt: string;
};

export function readDemandRows(): DemandRow[] {
  const stored = readJson<DemandRow[]>(DEMAND_ROWS_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (row): row is DemandRow =>
      Boolean(row) && typeof row.id === "string" && Array.isArray(row.rejections),
  );
}

export function writeDemandRows(rows: readonly DemandRow[]): void {
  writeJson(DEMAND_ROWS_KEY, rows, "ananta-demand-change");
}

export function clearDemandRows(): void {
  writeDemandRows([]);
}

/**
 * Merge a live rejection stream into the store.
 *
 * Merge key is `id`, so a record refused ten times is one row with `hits: 10`,
 * not ten rows. The rejection list is replaced rather than appended, because the
 * newest run is the current truth and an appended list would grow without bound
 * and would eventually show a constraint that no longer applies.
 *
 * Rows are returned sorted by `id`, so two runs of the same stream produce
 * byte-identical storage.
 *
 * `previous` is injected rather than always read from `localStorage` so the merge
 * is a pure function of its inputs and can be tested without a browser. The
 * browser path passes what is already stored.
 */
export function mergeDemandRows(
  previous: readonly DemandRow[],
  stream: readonly { id: string; rejections: Rejection[] }[],
  meta: { area: (id: string) => string; query: string; interest: string },
  now: string,
): DemandRow[] {
  const existing = new Map(previous.map((row) => [row.id, row]));
  for (const entry of stream) {
    const blocking = entry.rejections.filter((rejection) => rejection.blocking);
    if (!blocking.length) continue;
    const prior = existing.get(entry.id);
    existing.set(entry.id, {
      id: entry.id,
      area: meta.area(entry.id),
      query: meta.query,
      interest: meta.interest,
      hits: (prior?.hits ?? 0) + 1,
      rejections: blocking.slice().sort((a, b) => a.code.localeCompare(b.code)),
      firstSeenAt: prior?.firstSeenAt ?? now,
      lastSeenAt: now,
    });
  }
  return [...existing.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function recordDemandRows(
  stream: readonly { id: string; rejections: Rejection[] }[],
  meta: { area: (id: string) => string; query: string; interest: string },
  now: string,
): DemandRow[] {
  const rows = mergeDemandRows(readDemandRows(), stream, meta, now);
  writeDemandRows(rows);
  return rows;
}

/* ── the request inbox ────────────────────────────────────────────────────── */

export type RequestState = "open" | "accepted" | "declined";

export type ProviderRequest = {
  id: string;
  providerId: string;
  travellerId: string;
  recordId: string;
  message: string;
  state: RequestState;
  createdAt: string;
  respondedAt: string | null;
};

export const PROVIDER_REQUESTS_KEY_LOCAL = PROVIDER_REQUESTS_KEY;

/**
 * No seed. An empty inbox is the truth: nobody has asked anything on this device
 * yet, and a demo that opens with three fabricated enquiries is a demo that lies
 * on its first screen.
 */
export function readProviderRequests(): ProviderRequest[] {
  const stored = readJson<ProviderRequest[]>(PROVIDER_REQUESTS_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (row): row is ProviderRequest =>
      Boolean(row) &&
      typeof row.id === "string" &&
      (row.state === "open" || row.state === "accepted" || row.state === "declined"),
  );
}

export function writeProviderRequests(requests: readonly ProviderRequest[]): void {
  writeJson(PROVIDER_REQUESTS_KEY, requests, "ananta-requests-change");
}

/**
 * Open a request. `id` is derived from the inputs rather than `Date.now()`, so
 * the same ask twice on the same record does not create a duplicate and the
 * generated id is stable.
 */
export function createRequest(
  input: { providerId: string; travellerId: string; recordId: string; message: string },
  now: string,
): ProviderRequest[] {
  const id = `req-${input.providerId}-${input.recordId}`;
  const requests = readProviderRequests().filter((request) => request.id !== id);
  requests.push({
    id,
    providerId: input.providerId,
    travellerId: input.travellerId,
    recordId: input.recordId,
    message: input.message,
    state: "open",
    createdAt: now,
    respondedAt: null,
  });
  requests.sort((a, b) => a.id.localeCompare(b.id));
  writeProviderRequests(requests);
  return requests;
}

export function respondToRequest(
  requests: readonly ProviderRequest[],
  id: string,
  state: Exclude<RequestState, "open">,
  now: string,
): ProviderRequest[] {
  return requests
    .map((request) => (request.id === id ? { ...request, state, respondedAt: now } : request))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function openRequestCount(requests: readonly ProviderRequest[]): number {
  return requests.filter((request) => request.state === "open").length;
}

/* ── what the listing form parses ─────────────────────────────────────────── */

/**
 * `"700"`, `"Rs 700"` and `"₹700"` are all 700. A blank or unreadable field is
 * `null`, which means unknown, and unknown is not the same as free. The old form
 * required this input, showed it to the provider, and then threw it away.
 */
export function parsePrice(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  if (/free|nil|no charge/i.test(text)) return 0;
  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** `"2 hours"` is 120, `"90 min"` is 90, `"120"` is 120. Anything else is null. */
export function parseDuration(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  const hours = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/.exec(text);
  const minutes = /(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)/.exec(text);
  if (hours) return Math.round(Number(hours[1]) * 60);
  if (minutes) return Math.round(Number(minutes[1]));
  const bare = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(bare) && bare > 0 ? Math.round(bare) : null;
}

/**
 * A blank field is no link. A malformed field is no link, not a broken one, and a
 * `javascript:` URL is no link even though it parses. `sourceUrl` is
 * `string | null` everywhere in this product and never a placeholder.
 */
export function normaliseUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/* ── the alert signals the provider page reads ─────────────────────────────── */

export type ListingSignal = {
  id: string;
  area: string;
  hits: number;
  rejections: { code: RejectionCode; count: number; unit: RejectionUnit; sentence: string }[];
};

/**
 * The refusal tally for the listings a provider actually owns, read from the
 * persisted stream. A provider sees demand against their own records, not
 * against the whole city, because a global number is not actionable.
 */
export function listingDemand(
  rows: readonly DemandRow[],
  listings: readonly ProviderListing[],
): ListingSignal[] {
  const owned = new Map(listings.map((listing) => [listing.id, listing]));
  const signals: ListingSignal[] = [];
  for (const listing of listings) {
    const row = rows.find((candidate) => candidate.id === listing.id);
    if (!row) continue;
    const tally = new Map<RejectionCode, { count: number; unit: RejectionUnit; sentence: string }>();
    for (const rejection of row.rejections) {
      const current = tally.get(rejection.code);
      if (current) current.count += 1;
      else
        tally.set(rejection.code, {
          count: 1,
          unit: rejection.unit,
          sentence: rejection.sentence,
        });
    }
    signals.push({
      id: owned.get(listing.id)?.id ?? listing.id,
      area: listing.area,
      hits: row.hits,
      rejections: [...tally.entries()]
        .map(([code, value]) => ({ code, ...value }))
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    });
  }
  return signals;
}
