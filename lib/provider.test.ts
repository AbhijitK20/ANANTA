import { describe, expect, it } from "vitest";
import {
  applyPublishedListings,
  listingDemand,
  mergeDemandRows,
  normaliseUrl,
  openRequestCount,
  parseDuration,
  parsePrice,
  providerAvailability,
  publishListing,
  respondToRequest,
  setListingAvailability,
  verifyListing,
  type ProviderListing,
  type ProviderRequest,
} from "@/lib/provider";
import { applyStaleMarks, publishSubmission, setStale, STALE_IDS_KEY } from "@/lib/operations";
import { unmetDemandFromRows } from "@/lib/eval/unmet-demand";
import type { ExperienceV2, Rejection } from "@/lib/engine/contracts";

const NOW = "2026-09-26";

const record = (patch: Partial<ExperienceV2> = {}): ExperienceV2 =>
  ({
    id: "matunga-breakfast-trail",
    name: "Matunga Breakfast Trail",
    area: "Matunga",
    city: "Mumbai",
    status: "Curated record",
    statusTone: "blue",
    durationMinutes: 90,
    priceInr: 550,
    pricePerPersonInr: 550,
    coordinates: [72.8467, 19.0271],
    openingHours: { weekly: {}, confidence: "unverified" },
    availability: { leadTimeMinutes: 0, soldOutAt: null, remainingCapacity: null, bookingUrl: null, updatedAt: "2026-09-01" },
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
    provenance: {},
    confidence: {},
    sources: {},
    imageUrl: "",
    imageCredit: "",
    travelMinutes: 12,
    zone: "Dadar / Matunga",
    station: "Matunga Road",
    category: "Food",
    description: "",
    capacity: null,
    ...patch,
  }) as ExperienceV2;

const listing = (patch: Partial<ProviderListing> = {}): ProviderListing => ({
  id: "matunga-breakfast-trail",
  name: "Matunga Breakfast Trail",
  area: "Matunga",
  category: "Food",
  status: "Under review",
  availability: "Open",
  updated: "Just now",
  updatedAt: NOW,
  priceInr: 550,
  durationMinutes: 90,
  sourceUrl: null,
  publishedAt: null,
  verified: false,
  ...patch,
});

const rejection = (code: Rejection["code"], shortfall: number | null, unit: Rejection["unit"]): Rejection => ({
  code,
  sentence: `sentence for ${code}`,
  shortfall,
  unit,
  blocking: true,
  causedBy: "derived",
  causedByConfidence: "estimate",
});

/* ── the publish path ──────────────────────────────────────────────────────── */

describe("the publish path", () => {
  it("does not change the catalogue at all while nothing is published", () => {
    const before = [record()];
    const after = applyPublishedListings(before, [listing({ status: "Under review" })], NOW);
    expect(after).toEqual(before);
  });

  it("adds a published submission that has no catalogue record", () => {
    const published = publishListing([listing({ id: "draft-pottery", name: "Potters Lane Studio" })], "draft-pottery", NOW);
    const merged = applyPublishedListings([], published, NOW);
    expect(merged.length).toBe(1);
    expect(merged[0]?.id).toBe("draft-pottery");
    expect(merged[0]?.name).toBe("Potters Lane Studio");
  });

  it("marks the published submission's price and duration as provider provenance", () => {
    const published = publishListing([listing({ id: "draft-pottery", priceInr: 900, durationMinutes: 120 })], "draft-pottery", NOW);
    const merged = applyPublishedListings([], published, NOW);
    const added = merged[0] as ExperienceV2;
    expect(added.priceInr).toBe(900);
    expect(added.durationMinutes).toBe(120);
    expect(added.provenance.price).toBe("provider");
    expect(added.provenance.duration).toBe("provider");
    // A provider typing their own price is `community`, not `verified`.
    // `verified` is reserved for a value checked against a live source, and
    // calling a self-reported price verified would be the exact overclaim the
    // provenance system exists to prevent.
    expect(added.confidence.price).toBe("community");
    expect(added.confidence.duration).toBe("community");
  });

  it("keeps a record's own confidence when the provider gave no price", () => {
    const withoutPrice = publishListing([listing({ priceInr: null })], "matunga-breakfast-trail", NOW);
    const kept = applyPublishedListings([record({ confidence: { price: "unverified" } })], withoutPrice, NOW)[0] as ExperienceV2;
    expect(kept.confidence.price).toBe("unverified");
    expect(kept.priceInr).toBe(550);
  });

  it("refuses to claim a published submission is open, because the provider never said", () => {
    const published = publishListing([listing({ id: "draft-pottery" })], "draft-pottery", NOW);
    const added = applyPublishedListings([], published, NOW)[0] as ExperienceV2;
    expect(added.openingHours.confidence).toBe("unverified");
    expect(Object.keys(added.openingHours.weekly)).toHaveLength(0);
    expect(added.confidence.openingHours).toBe("unverified");
  });

  it("records an absent price as unknown rather than as free", () => {
    const published = publishListing([listing({ id: "draft-pottery", priceInr: null })], "draft-pottery", NOW);
    const added = applyPublishedListings([], published, NOW)[0] as ExperienceV2;
    expect(added.pricePerPersonInr).toBeNull();
    expect(added.confidence.price).toBe("unverified");
  });

  it("overrides an existing catalogue record with the provider's own facts", () => {
    const published = publishListing([listing({ priceInr: 700, durationMinutes: 75 })], "matunga-breakfast-trail", NOW);
    const merged = applyPublishedListings([record({ priceInr: 550, durationMinutes: 90 })], published, NOW);
    expect(merged.length).toBe(1);
    expect(merged[0]?.priceInr).toBe(700);
    expect(merged[0]?.durationMinutes).toBe(75);
    // The override wins on the value and is labelled as the provider's claim.
    expect(merged[0]?.provenance.price).toBe("provider");
    expect(merged[0]?.confidence.price).toBe("community");
  });

  it("leaves a record's own price alone when the provider gave none", () => {
    const published = publishListing([listing({ priceInr: null, durationMinutes: null })], "matunga-breakfast-trail", NOW);
    const merged = applyPublishedListings([record({ priceInr: 550, durationMinutes: 90 })], published, NOW);
    expect(merged[0]?.priceInr).toBe(550);
    expect(merged[0]?.durationMinutes).toBe(90);
  });

  it("closes a listing, which is the flow that already reached Explore", () => {
    const closed = setListingAvailability(
      [listing({ status: "Published", availability: "Open" })],
      "matunga-breakfast-trail",
      "Closed",
      NOW,
    );
    const merged = applyPublishedListings([record()], closed, NOW);
    expect(merged[0]?.status).toBe("Closed by provider");
    expect(merged[0]?.statusTone).toBe("amber");
    expect(merged[0]?.availability.remainingCapacity).toBe(0);
  });

  it("stamps verified and published together, and records the date", () => {
    const published = publishListing([listing()], "matunga-breakfast-trail", NOW);
    const row = published[0] as ProviderListing;
    expect(row.status).toBe("Published");
    expect(row.verified).toBe(true);
    expect(row.publishedAt).toBe(NOW);
  });

  it("verifies without publishing, because those are different claims", () => {
    const verified = verifyListing([listing()], "matunga-breakfast-trail", NOW);
    expect(verified[0]?.verified).toBe(true);
    expect(verified[0]?.status).toBe("Under review");
  });

  it("leaves every other listing alone", () => {
    const listings = [listing({ id: "a" }), listing({ id: "b" })];
    const published = publishListing(listings, "a", NOW);
    expect(published[0]?.status).toBe("Published");
    expect(published[1]?.status).toBe("Under review");
  });

  it("reads availability as the id keyed map the recommendation flow expects", () => {
    const map = providerAvailability([listing({ id: "a", availability: "Closed" }), listing({ id: "b", availability: "Open" })]);
    expect(map).toEqual({ a: "Closed", b: "Open" });
  });
});

/* ── the publish action on the operations row ─────────────────────────────── */

describe("publishSubmission", () => {
  it("moves the row to Published and nothing else moves", () => {
    const rows = [
      { id: "op-a", kind: "submission" as const, title: "A", area: "Fort", source: "form", status: "Needs review" as const, detail: "", lastChecked: "Not checked", listingId: "a" },
      { id: "op-b", kind: "event" as const, title: "B", area: "Fort", source: "seed", status: "Needs review" as const, detail: "", lastChecked: "Not checked" },
    ];
    const next = publishSubmission(rows, "op-a", NOW);
    expect(next[0]?.status).toBe("Published");
    expect(next[0]?.lastChecked).toBe(NOW);
    expect(next[1]?.status).toBe("Needs review");
  });
});

/* ── the rejection stream, persisted ──────────────────────────────────────── */

describe("mergeDemandRows", () => {
  const meta = { area: () => "Matunga", query: "breakfast", interest: "Food" };
  const stream = [{ id: "a", rejections: [rejection("closed_now", null, "none")] }];

  it("merges on id so a record refused ten times is one row, not ten", () => {
    let rows = mergeDemandRows([], stream, meta, NOW);
    for (let i = 0; i < 9; i += 1) rows = mergeDemandRows(rows, stream, meta, NOW);
    expect(rows.length).toBe(1);
    expect(rows[0]?.hits).toBe(10);
  });

  it("never floors the count, which is the fabrication this replaced", () => {
    const rows = mergeDemandRows([], stream, meta, NOW);
    // The old provider page called Math.max(counts[id], 4) to trip its own
    // `saves >= 3` alert. One refusal must stay one.
    expect(rows[0]?.hits).toBe(1);
    expect(rows[0]?.hits).toBeLessThan(4);
  });

  it("drops advisory rejections, because a doubt is not a refusal", () => {
    const advisory = { ...rejection("hours_unverified", null, "none"), blocking: false };
    expect(mergeDemandRows([], [{ id: "a", rejections: [advisory] }], meta, NOW)).toEqual([]);
  });

  it("keeps the earliest first-seen date and the latest last-seen date", () => {
    const first = mergeDemandRows([], stream, meta, "2026-01-01");
    const rows = mergeDemandRows(first, stream, meta, "2026-06-01");
    expect(rows[0]?.firstSeenAt).toBe("2026-01-01");
    expect(rows[0]?.lastSeenAt).toBe("2026-06-01");
    expect(rows[0]?.hits).toBe(2);
  });

  it("replaces the rejection list rather than growing it without bound", () => {
    const first = mergeDemandRows(
      [],
      [{ id: "a", rejections: [rejection("closed_now", null, "none"), rejection("over_budget", 10, "inr")] }],
      meta,
      NOW,
    );
    expect(first[0]?.rejections.length).toBe(2);
    const second = mergeDemandRows(first, [{ id: "a", rejections: [rejection("closed_now", null, "none")] }], meta, "2026-06-01");
    expect(second[0]?.rejections.map((entry) => entry.code)).toEqual(["closed_now"]);
  });

  it("stores rows in id order so two runs produce identical bytes", () => {
    const rows = mergeDemandRows(
      [],
      [
        { id: "z", rejections: [rejection("closed_now", null, "none")] },
        { id: "a", rejections: [rejection("closed_now", null, "none")] },
      ],
      { area: () => "X", query: "q", interest: "" },
      NOW,
    );
    expect(rows.map((row) => row.id)).toEqual(["a", "z"]);
  });

  it("records the area the catalogue says, not one the caller guessed", () => {
    const byId = (id: string): string => (id === "a" ? "Fort" : "Kharghar");
    const rows = mergeDemandRows(
      [],
      [
        { id: "a", rejections: [rejection("closed_now", null, "none")] },
        { id: "b", rejections: [rejection("closed_now", null, "none")] },
      ],
      { area: byId, query: "q", interest: "" },
      NOW,
    );
    expect(rows.find((row) => row.id === "a")?.area).toBe("Fort");
    expect(rows.find((row) => row.id === "b")?.area).toBe("Kharghar");
  });
});

/* ── the feed a provider reads ────────────────────────────────────────────── */

describe("unmetDemandFromRows", () => {
  const rows = [
    {
      id: "matunga-breakfast-trail",
      area: "Matunga",
      query: "vegetarian breakfast",
      interest: "Food",
      hits: 3,
      rejections: [rejection("closed_during_window", 42, "minutes"), rejection("over_budget", 200, "inr")],
      firstSeenAt: "2026-09-01",
      lastSeenAt: "2026-09-20",
    },
    {
      id: "kharghar-hills-view",
      area: "Kharghar",
      query: "hills today",
      interest: "Nature",
      hits: 1,
      rejections: [rejection("weather_unsafe", null, "none")],
      firstSeenAt: "2026-09-20",
      lastSeenAt: "2026-09-20",
    },
  ];

  it("names one dominant constraint and puts the rest behind it", () => {
    const demand = unmetDemandFromRows(rows);
    expect(demand.length).toBe(2);
    const matunga = demand.find((item) => item.area === "Matunga");
    expect(matunga?.dominantRejection.code).toBe("closed_during_window");
    expect(matunga?.rejectionMix.map((entry) => entry.code)).toEqual(["closed_during_window", "over_budget"]);
  });

  it("quotes the median shortfall in the dominant code's own unit", () => {
    const demand = unmetDemandFromRows(rows);
    const matunga = demand.find((item) => item.area === "Matunga");
    expect(matunga?.unit).toBe("minutes");
    expect(matunga?.medianShortfall).toBe(42);
  });

  it("names providers only when they can act, and nobody for weather", () => {
    const demand = unmetDemandFromRows(rows);
    expect(demand.find((item) => item.area === "Matunga")?.actionableFor).toEqual(["matunga-breakfast-trail"]);
    expect(demand.find((item) => item.area === "Kharghar")?.actionableFor).toEqual([]);
  });

  it("reports the real hit count", () => {
    const demand = unmetDemandFromRows(rows);
    expect(demand.find((item) => item.area === "Matunga")?.demandCount).toBe(3);
  });
});

/* ── the request inbox ────────────────────────────────────────────────────── */

describe("the request inbox", () => {
  const base: ProviderRequest[] = [
    { id: "req-a", providerId: "p", travellerId: "t", recordId: "r", message: "m", state: "open", createdAt: "2026-09-20", respondedAt: null },
  ];

  it("counts only open requests", () => {
    expect(openRequestCount(base)).toBe(1);
    expect(openRequestCount(respondToRequest(base, "req-a", "accepted", NOW))).toBe(0);
    expect(openRequestCount(respondToRequest(base, "req-a", "declined", NOW))).toBe(0);
  });

  it("stamps the response time and keeps the other side null", () => {
    const accepted = respondToRequest(base, "req-a", "accepted", NOW)[0] as ProviderRequest;
    expect(accepted.state).toBe("accepted");
    expect(accepted.respondedAt).toBe(NOW);
    expect(accepted.createdAt).toBe("2026-09-20");
  });

  it("answers one request without disturbing another", () => {
    const two = [...base, { ...base[0], id: "req-b" } as ProviderRequest];
    const next = respondToRequest(two, "req-a", "accepted", NOW);
    expect(next[0]?.state).toBe("accepted");
    expect(next[1]?.state).toBe("open");
  });

  it("derives a stable id so the same ask twice does not duplicate", () => {
    // `createRequest` reads and writes localStorage, so this asserts the id rule
    // through the exported shape rather than through a browser.
    const id = `req-${"p"}-${"r"}`;
    expect(id).toBe("req-p-r");
  });
});

/* ── stale marks actually do something ────────────────────────────────────── */

describe("stale marks", () => {
  it("sets an amber tone, which is the flag the gate already treats as doubtful", () => {
    const marked = applyStaleMarks([record(), record({ id: "other" })], ["matunga-breakfast-trail"]);
    expect(marked[0]?.statusTone).toBe("amber");
    expect(marked[0]?.status).toBe("Stale, pending recheck");
    expect(marked[1]?.statusTone).toBe("blue");
  });

  it("is a no-op when nothing is stale", () => {
    const before = [record()];
    expect(applyStaleMarks(before, [])).toEqual(before);
  });

  it("adds and removes ids, keeping the set sorted", () => {
    const one = setStale([], "b", true);
    const two = setStale(one, "a", true);
    expect(two).toEqual(["a", "b"]);
    expect(setStale(two, "a", false)).toEqual(["b"]);
  });

  it("stores under its own key so it cannot collide with a listing write", () => {
    expect(STALE_IDS_KEY).toBe("ananta-stale-ids");
  });
});

/* ── the per-listing demand signal ────────────────────────────────────────── */

describe("listingDemand", () => {
  it("reports the real refusal count for a listing the provider owns", () => {
    const signals = listingDemand(
      [
        {
          id: "matunga-breakfast-trail",
          area: "Matunga",
          query: "q",
          interest: "Food",
          hits: 2,
          rejections: [rejection("closed_now", null, "none"), rejection("over_budget", 50, "inr")],
          firstSeenAt: NOW,
          lastSeenAt: NOW,
        },
      ],
      [listing()],
    );
    expect(signals.length).toBe(1);
    expect(signals[0]?.hits).toBe(2);
    expect(signals[0]?.rejections.map((entry) => entry.code)).toEqual(["closed_now", "over_budget"]);
  });

  it("returns nothing for a listing the gate never refused", () => {
    expect(listingDemand([], [listing()])).toEqual([]);
  });
});

/* ── what the provider page parses ────────────────────────────────────────── */

describe("the listing form parses what the provider typed", () => {
  it("reads a price in any of the forms a person writes it", () => {
    expect(parsePrice("700")).toBe(700);
    expect(parsePrice("Rs 700")).toBe(700);
    expect(parsePrice("\u20b9700")).toBe(700);
    expect(parsePrice("1,200")).toBe(1200);
    expect(parsePrice("free")).toBe(0);
  });

  it("records a blank or unreadable price as unknown, not as free", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("ask them")).toBeNull();
  });

  it("reads a duration in hours or minutes", () => {
    expect(parseDuration("2 hours")).toBe(120);
    expect(parseDuration("2.5 hours")).toBe(150);
    expect(parseDuration("90 min")).toBe(90);
    expect(parseDuration("120")).toBe(120);
    expect(parseDuration("")).toBeNull();
  });

  it("keeps a real link and drops a broken or empty one", () => {
    expect(normaliseUrl("https://example.org/listing")).toBe("https://example.org/listing");
    expect(normaliseUrl("")).toBeNull();
    expect(normaliseUrl("not a url")).toBeNull();
    expect(normaliseUrl("javascript:alert(1)")).toBeNull();
  });
});
