import { describe, expect, it } from "vitest";
import type { AccessNeed, ExperienceV2, OpeningHours, ProvenancedField, Sourced } from "@/lib/engine";
import { ACCESS_NEEDS } from "@/lib/engine";
import { FIELD_LABEL } from "@/components/ananta/tokens";
import {
  ABSENT_LABEL,
  NO_LABEL,
  YES_LABEL,
  absenceCount,
  accessRecordedCount,
  accessRows,
  bestTimeSummary,
  bookingSummary,
  capacitySummary,
  coordinatesSummary,
  dietSummary,
  durationSummary,
  fieldCount,
  gradedRows,
  hoursSummary,
  indoorSummary,
  isAbsence,
  kidFriendlySummary,
  pricePerPersonSummary,
  priceSummary,
  ratingSummary,
  reviewCountSummary,
  seasonSummary,
  verdictFor,
  whollyUnverified,
} from "./rows";

const ALL_DAY: OpeningHours["weekly"] = {
  0: [{ from: 540, to: 1140 }],
  1: [{ from: 540, to: 1140 }],
  2: [{ from: 540, to: 1140 }],
  3: [{ from: 540, to: 1140 }],
  4: [{ from: 540, to: 1140 }],
};

function record(over: Partial<ExperienceV2> = {}): ExperienceV2 {
  const confidence: Record<ProvenancedField, "verified"> = Object.fromEntries(
    Object.keys(FIELD_LABEL).map((field) => [field, "verified"]),
  ) as Record<ProvenancedField, "verified">;
  const sources: Partial<Record<ProvenancedField, Sourced<unknown>>> = {};
  return {
    id: "r",
    name: "Place",
    area: "Quarter",
    city: "Harbour City",
    zone: "Zone",
    station: "Station",
    category: "Culture",
    description: "",
    coordinates: [72.83, 18.92],
    travelMinutes: 12,
    durationMinutes: 120,
    priceInr: 500,
    pricePerPersonInr: 500,
    capacity: 40,
    openingHours: { weekly: ALL_DAY, confidence: "verified" },
    availability: {
      leadTimeMinutes: 0,
      soldOutAt: null,
      remainingCapacity: null,
      bookingUrl: null,
      updatedAt: "2026-09-01",
    },
    access: {},
    diets: ["vegetarian"],
    indoor: "indoor",
    kidFriendly: true,
    season: null,
    bestTimeOfDay: "morning",
    ratingSum: 46,
    reviewCount: 10,
    authenticity: 0.8,
    providerReliability: 0.7,
    crowdProfile: 0.4,
    provenance: Object.fromEntries(
      Object.keys(FIELD_LABEL).map((field) => [field, "curated"]),
    ) as ExperienceV2["provenance"],
    confidence,
    sources,
    imageUrl: "",
    imageCredit: "",
    status: "",
    statusTone: "blue",
    updated: "",
    ...over,
  };
}

const label = (need: AccessNeed) => need.replace(/_/g, " ");

describe("verdictFor", () => {
  it("separates unknown from false", () => {
    expect(verdictFor(true)).toBe("yes");
    expect(verdictFor(false)).toBe("no");
    expect(verdictFor(undefined)).toBe("not-recorded");
    expect(verdictFor(null)).toBe("not-recorded");
  });

  it("uses different words for no and for not recorded", () => {
    expect(NO_LABEL).toBe("No");
    expect(ABSENT_LABEL).toBe("Not recorded");
    expect(NO_LABEL).not.toBe(ABSENT_LABEL);
    expect(YES_LABEL).not.toBe(ABSENT_LABEL);
  });

  it("never renders an absence as a blank or a dash", () => {
    for (const row of gradedRows(record({ capacity: null }))) {
      expect(row.value.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("the absence row is designed, not apologetic", () => {
  it("says we do not know, and says the gate will not guess", () => {
    const row = hoursSummary(record({ openingHours: { weekly: {}, confidence: "unverified" } }));
    expect(row.value).toBe(ABSENT_LABEL);
    expect(row.verdict).toBe("not-recorded");
    expect(row.note).toContain("will not claim");
  });

  it("treats an empty weekly map as unknown even if confidence claims verified", () => {
    const row = hoursSummary(record({ openingHours: { weekly: {}, confidence: "verified" } }));
    expect(row.value).toBe(ABSENT_LABEL);
  });

  it("refuses to render a zero duration as a real figure", () => {
    expect(durationSummary(record({ durationMinutes: 0 })).value).toBe(ABSENT_LABEL);
    expect(durationSummary(record({ durationMinutes: Number.NaN })).value).toBe(ABSENT_LABEL);
  });

  it("reads a real duration as a real figure", () => {
    expect(durationSummary(record({ durationMinutes: 120 })).value).toContain("2");
    expect(durationSummary(record({ durationMinutes: 120 })).verdict).not.toBe("not-recorded");
  });
});

describe("accessibility: not recorded is not no", () => {
  it("shows all seven needs whatever the record holds", () => {
    const rows = accessRows(record(), label);
    expect(rows).toHaveLength(ACCESS_NEEDS.length);
    expect(rows).toHaveLength(7);
  });

  it("renders an unrecorded need as not recorded, never as no", () => {
    const rows = accessRows(record(), label);
    const stepFree = rows.find((r) => r.need === "step_free");
    expect(stepFree?.verdict).toBe("not-recorded");
    expect(stepFree?.label).toBe("step free");
  });

  it("renders a recorded no as no, which is a different claim", () => {
    const rows = accessRows(record({ access: { step_free: false } }), label);
    const stepFree = rows.find((r) => r.need === "step_free");
    expect(stepFree?.verdict).toBe("no");
    const quiet = rows.find((r) => r.need === "quiet_space");
    expect(quiet?.verdict).toBe("not-recorded");
  });

  it("counts only the needs somebody actually recorded", () => {
    expect(accessRecordedCount(record())).toBe(0);
    expect(accessRecordedCount(record({ access: { step_free: true } }))).toBe(1);
    expect(accessRecordedCount(record({ access: { step_free: false } }))).toBe(1);
  });

  it("keeps the row order stable so two records compare cleanly", () => {
    const a = accessRows(record({ access: { service_animal_ok: true } }), label);
    const b = accessRows(record(), label);
    expect(a.map((r) => r.need)).toEqual(b.map((r) => r.need));
  });
});

describe("the other graded fields distinguish absent from present", () => {
  it("capacity", () => {
    expect(capacitySummary(record({ capacity: null })).value).toBe(ABSENT_LABEL);
    expect(capacitySummary(record({ capacity: 40 })).value).toContain("40");
  });

  it("kid friendly", () => {
    expect(kidFriendlySummary(record({ kidFriendly: null })).value).toBe(ABSENT_LABEL);
    expect(kidFriendlySummary(record({ kidFriendly: false })).value).toBe(NO_LABEL);
    expect(kidFriendlySummary(record({ kidFriendly: false })).verdict).toBe("no");
    expect(kidFriendlySummary(record({ kidFriendly: true })).value).toBe(YES_LABEL);
  });

  it("diet, where an empty list is unknown rather than none served", () => {
    const row = dietSummary(record({ diets: [] }));
    expect(row.value).toBe(ABSENT_LABEL);
    expect(row.value.toLowerCase()).not.toContain("none");
    expect(dietSummary(record({ diets: ["vegan"] })).value).toBe("vegan");
  });

  it("rating and review count together", () => {
    expect(ratingSummary(record({ ratingSum: null, reviewCount: null })).value).toBe(ABSENT_LABEL);
    expect(reviewCountSummary(record({ reviewCount: null })).value).toBe(ABSENT_LABEL);
    expect(ratingSummary(record({ ratingSum: 46, reviewCount: 10 })).value).toBe("4.6 of 5");
  });

  it("season", () => {
    expect(seasonSummary(record({ season: null })).value).toBe(ABSENT_LABEL);
    const inSeason = seasonSummary(record({ season: { months: [11, 12, 1], note: "Cool months" } }));
    expect(inSeason.value).toContain("11");
    expect(inSeason.note).toBe("Cool months");
  });

  it("booking, where sold out is a fact and no link is an absence", () => {
    expect(bookingSummary(record({ availability: { leadTimeMinutes: 0, soldOutAt: null, remainingCapacity: null, bookingUrl: null, updatedAt: "2026-09-01" } })).value).toBe(ABSENT_LABEL);
    const soldOut = bookingSummary(record({ availability: { leadTimeMinutes: 0, soldOutAt: "2026-09-02T10:00:00Z", remainingCapacity: null, bookingUrl: null, updatedAt: "2026-09-01" } }));
    expect(soldOut.value).toBe("Sold out");
    expect(soldOut.verdict).not.toBe("not-recorded");
    expect(soldOut.note).toContain("2026-09-02T10:00:00Z");
  });

  it("coordinates, where an area centre is flagged as approximate", () => {
    const matched = coordinatesSummary(record({ provenance: { ...record().provenance, coordinates: "osm" } }));
    expect(matched.verdict).not.toBe("not-recorded");
    expect(matched.note).toContain("OpenStreetMap");
    const area = coordinatesSummary(record({ provenance: { ...record().provenance, coordinates: "inferred" } }));
    expect(area.verdict).toBe("not-recorded");
    expect(area.note).toContain("approximate");
  });

  it("indoor and best time, which are always present on a record", () => {
    expect(indoorSummary(record({ indoor: "outdoor" })).value).toBe("Outdoor");
    expect(indoorSummary(record({ indoor: "mixed" })).value).toBe("Indoor and outdoor");
    expect(bestTimeSummary(record({ bestTimeOfDay: "any" })).verdict).toBe("not-recorded");
    expect(bestTimeSummary(record({ bestTimeOfDay: "evening" })).value).toBe("Evening");
  });
});

describe("price", () => {
  it("says Free for zero rather than printing a zero-rupee figure", () => {
    expect(priceSummary(record({ priceInr: 0 })).value).toBe("Free");
    expect(pricePerPersonSummary(record({ pricePerPersonInr: 0 })).value).toBe("Free");
  });

  it("keeps a missing per-person price as an absence", () => {
    expect(pricePerPersonSummary(record({ pricePerPersonInr: null })).value).toBe(ABSENT_LABEL);
  });
});

describe("the table", () => {
  it("covers the graded fields a planner reads", () => {
    const fields = gradedRows(record()).map((row) => row.field);
    for (const field of [
      "duration",
      "openingHours",
      "price",
      "pricePerPerson",
      "capacity",
      "booking",
      "indoor",
      "kidFriendly",
      "bestTime",
      "diet",
      "seasonality",
      "rating",
      "reviewCount",
      "coordinates",
    ] as ProvenancedField[]) {
      expect(fields).toContain(field);
    }
  });

  it("has no duplicate field", () => {
    const fields = gradedRows(record()).map((row) => row.field);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("labels every row from the shared token map, not a retyped string", () => {
    for (const row of gradedRows(record())) {
      expect(FIELD_LABEL[row.field].length).toBeGreaterThan(0);
    }
  });

  it("counts its own absences", () => {
    expect(absenceCount(record())).toBeGreaterThan(0);
    expect(absenceCount(record())).toBeLessThan(gradedRows(record()).length);
  });

  it("is a pure function of the record", () => {
    const r = record();
    expect(gradedRows(r)).toEqual(gradedRows(r));
  });
});

describe("the mixed state never collapses", () => {
  it("counts verified, estimated and unknown fields", () => {
    const r = record();
    const count = fieldCount(r);
    expect(count.total).toBe(Object.keys(FIELD_LABEL).length);
    expect(count.verified + count.estimated + count.unknown).toBe(count.total);
    expect(count.verified).toBe(count.total);
    expect(count.mixed).toBe(false);
  });

  it("is mixed the moment one field is not verified", () => {
    const r = record({ confidence: { ...record().confidence, price: "estimate" } });
    const count = fieldCount(r);
    expect(count.mixed).toBe(true);
    expect(count.verified).toBe(count.total - 1);
    expect(count.estimated).toBe(1);
  });

  it("treats a community field as sourced, not unknown", () => {
    const r = record({ confidence: { ...record().confidence, name: "community" } });
    expect(fieldCount(r).verified).toBe(fieldCount(r).total);
    expect(fieldCount(r).unknown).toBe(0);
  });

  it("treats a wholly unknown record as wholly unknown", () => {
    const r = record({ confidence: {} });
    expect(whollyUnverified(r)).toBe(true);
    expect(fieldCount(r).verified).toBe(0);
  });

  it("does not call a generated record verified", () => {
    // The stand-in dataset marks every generated value inferred plus estimate.
    const r = record({
      confidence: {
        ...record().confidence,
        price: "estimate",
        duration: "estimate",
        openingHours: "unverified",
        capacity: "unverified",
      },
    });
    expect(fieldCount(r).mixed).toBe(true);
    expect(fieldCount(r).verified).toBeLessThan(fieldCount(r).total);
  });
});

describe("isAbsence", () => {
  it("is true only for the unknown state", () => {
    expect(isAbsence("not-recorded")).toBe(true);
    expect(isAbsence("no")).toBe(false);
    expect(isAbsence("yes")).toBe(false);
  });
});
