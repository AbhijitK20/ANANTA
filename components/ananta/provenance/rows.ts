import type { AccessNeed, ExperienceV2, ProvenancedField } from "@/lib/engine";
import { ACCESS_NEEDS } from "@/lib/engine";
import { FIELD_LABEL } from "@/components/ananta/tokens";
import { clockLabel, hoursLabel, inrLabel } from "@/components/ananta/pipeline";

/**
 * The graded-facts table, as data.
 *
 * This file has no JSX on purpose. The rule the whole session turns on is that
 * "Not recorded" and "No" are different answers, and the cheapest way to prove
 * that rule is to hold it in a function a test can call without a browser.
 *
 * Three states, never two:
 *
 *   yes           something is on record and it is true
 *   no            something is on record and it is false
 *   not-recorded  nothing is on record, and we will not guess
 *
 * A traveller planning a visit with an older relative is making a decision on
 * the third state. Collapsing it into the second tells them a step-free route
 * does not exist when the truth is that nobody has looked.
 */

export type Verdict = "yes" | "no" | "not-recorded";

export const YES_LABEL = "Yes";
export const NO_LABEL = "No";
/** Deliberately not "None" and not "N/A". Both read as a claim. */
export const ABSENT_LABEL = "Not recorded";

export const VERDICT_LABEL: Record<Verdict, string> = {
  yes: YES_LABEL,
  no: NO_LABEL,
  "not-recorded": ABSENT_LABEL,
};

export interface GradedRow {
  field: ProvenancedField;
  /** The value as it will be read out. Never a blank, never a dash. */
  value: string;
  /**
   * Defaults to `yes`, which is the honest reading of a value that is present.
   * Only the absences and the recorded negatives have to say so explicitly, and
   * making them opt in keeps a hundred present values from repeating it.
   */
  verdict?: Verdict;
  /** A second line, only when it adds something the value cannot. */
  note?: string;
}

/** The verdict, with the documented default applied. */
export function verdictOf(row: GradedRow): Verdict {
  return row.verdict ?? "yes";
}

export function isAbsence(verdict: Verdict): boolean {
  return verdict === "not-recorded";
}

/** `undefined` means nobody recorded the fact. `false` means they recorded no. */
export function verdictFor(value: boolean | undefined | null): Verdict {
  if (value === undefined || value === null) return "not-recorded";
  return value ? "yes" : "no";
}

/* per field summarisers ------ */

/** `"2 hours"`, or the absence. Never "0 min" for an unknown duration. */
export function durationSummary(record: ExperienceV2): GradedRow {
  if (!Number.isFinite(record.durationMinutes) || record.durationMinutes <= 0) {
    return { field: "duration", value: ABSENT_LABEL, verdict: "not-recorded" };
  }
  return { field: "duration", value: hoursLabel(record.durationMinutes) };
}

export function priceSummary(record: ExperienceV2): GradedRow {
  return {
    field: "price",
    value: record.priceInr === 0 ? "Free" : inrLabel(record.priceInr),
  };
}

export function pricePerPersonSummary(record: ExperienceV2): GradedRow {
  if (record.pricePerPersonInr === null) {
    return {
      field: "pricePerPerson",
      value: ABSENT_LABEL,
      verdict: "not-recorded",
      note: "No separate per-person price is on record.",
    };
  }
  return {
    field: "pricePerPerson",
    value: record.pricePerPersonInr === 0 ? "Free" : inrLabel(record.pricePerPersonInr),
    note: "Carried from the listed price. The record has no separate head rate.",
  };
}

export function capacitySummary(record: ExperienceV2): GradedRow {
  if (record.capacity === null) {
    return {
      field: "capacity",
      value: ABSENT_LABEL,
      verdict: "not-recorded",
      note: "Nobody has recorded how many people this place takes at once.",
    };
  }
  return {
    field: "capacity",
    value: `${record.capacity} at a time`,
    note: "A party larger than this is refused by the gate rather than turned away on arrival.",
  };
}

/**
 * Opening hours, or the honest absence.
 *
 * `confidence: "unverified"` on the record is the load-bearing bit. A weekly
 * map with no confidence says we looked. Without one we did not, and the copy
 * has to say so rather than render an empty timetable.
 */
export function hoursSummary(record: ExperienceV2): GradedRow {
  const hours = record.openingHours;
  const days = Object.keys(hours.weekly).filter(
    (day) => (hours.weekly[Number(day) as 0 | 1 | 2 | 3 | 4 | 5 | 6] ?? []).length > 0,
  );
  if (hours.confidence === "unverified" || days.length === 0) {
    return {
      field: "openingHours",
      value: ABSENT_LABEL,
      verdict: "not-recorded",
      note: "We do not know yet. The gate will not claim this place is open, so it will not plan a visit around it.",
    };
  }
  const sample = days
    .slice(0, 2)
    .map((day) => {
      const windows = hours.weekly[Number(day) as 0 | 1 | 2 | 3 | 4 | 5 | 6] ?? [];
      return windows.map((w) => `${clockLabel(w.from)} to ${clockLabel(w.to)}`).join(", ");
    })
    .join("; ");
  return {
    field: "openingHours",
    value: sample,
    note:
      days.length > 2
        ? `Listed on ${days.length} days. The rest are not claimed either way.`
        : undefined,
  };
}

export function indoorSummary(record: ExperienceV2): GradedRow {
  const label = record.indoor === "indoor" ? "Indoor" : record.indoor === "outdoor" ? "Outdoor" : "Indoor and outdoor";
  return { field: "indoor", value: label };
}

export function kidFriendlySummary(record: ExperienceV2): GradedRow {
  if (record.kidFriendly === null) {
    return {
      field: "kidFriendly",
      value: ABSENT_LABEL,
      verdict: "not-recorded",
      note: "No age or facility record exists for this place, so suitability is not claimed.",
    };
  }
  return {
    field: "kidFriendly",
    value: record.kidFriendly ? YES_LABEL : NO_LABEL,
    verdict: verdictFor(record.kidFriendly),
  };
}

export function bestTimeSummary(record: ExperienceV2): GradedRow {
  if (record.bestTimeOfDay === "any") {
    return {
      field: "bestTime",
      value: "No preference on record",
      verdict: "not-recorded",
      note: "Nothing suggests a better hour, so any hour scores the same.",
    };
  }
  const label =
    record.bestTimeOfDay === "morning"
      ? "Morning"
      : record.bestTimeOfDay === "afternoon"
        ? "Afternoon"
        : record.bestTimeOfDay === "evening"
          ? "Evening"
          : "Night";
  return { field: "bestTime", value: label };
}

/** An empty diet list is unknown, not "no food is served here". */
export function dietSummary(record: ExperienceV2): GradedRow {
  if (record.diets.length === 0) {
    return {
      field: "diet",
      value: ABSENT_LABEL,
      verdict: "not-recorded",
      note: "No kitchen or menu information is on record, so diet needs cannot be confirmed.",
    };
  }
  return {
    field: "diet",
    value: record.diets.map((d) => d.replace(/_/g, " ")).join(", "),
  };
}

export function seasonSummary(record: ExperienceV2): GradedRow {
  if (record.season === null) {
    return {
      field: "seasonality",
      value: ABSENT_LABEL,
      verdict: "not-recorded",
    };
  }
  return {
    field: "seasonality",
    value: record.season.months.map((m) => m).join(", "),
    note: record.season.note,
  };
}

export function ratingSummary(record: ExperienceV2): GradedRow {
  if (record.ratingSum === null || record.reviewCount === null || record.reviewCount <= 0) {
    return {
      field: "rating",
      value: ABSENT_LABEL,
      verdict: "not-recorded",
      note: "No review count is on record, so the rating component scores zero rather than guessing.",
    };
  }
  const mean = record.ratingSum / record.reviewCount;
  return {
    field: "rating",
    value: `${mean.toFixed(1)} of 5`,
    note: `Mean of ${record.reviewCount} reviews. The score uses a lower bound, so a thin sample is pulled down on purpose.`,
  };
}

export function reviewCountSummary(record: ExperienceV2): GradedRow {
  if (record.reviewCount === null || record.reviewCount <= 0) {
    return { field: "reviewCount", value: ABSENT_LABEL, verdict: "not-recorded" };
  }
  return { field: "reviewCount", value: String(record.reviewCount) };
}

export function bookingSummary(record: ExperienceV2): GradedRow {
  const availability = record.availability;
  if (availability.soldOutAt !== null) {
    return {
      field: "booking",
      value: "Sold out",
      note: `From ${availability.soldOutAt}. A replan will swap this stop out rather than route you to a closed door.`,
    };
  }
  if (availability.bookingUrl !== null) {
    return { field: "booking", value: "Bookable online" };
  }
  return {
    field: "booking",
    value: ABSENT_LABEL,
    verdict: "not-recorded",
    note: "No booking link and no provider feed exist for this place. Booking is not live in this build.",
  };
}

export function coordinatesSummary(record: ExperienceV2): GradedRow {
  const [lon, lat] = record.coordinates;
  const rounded = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
  if (record.provenance.coordinates === "osm") {
    return { field: "coordinates", value: rounded, note: "Matched to this place's OpenStreetMap feature." };
  }
  return {
    field: "coordinates",
    value: rounded,
    verdict: "not-recorded",
    note: "This is the area centre plus a fixed offset, not the venue. Treat the map position as approximate.",
  };
}

/* accessibility, all seven needs, always ------ */

export interface AccessRow {
  need: AccessNeed;
  label: string;
  verdict: Verdict;
}

/**
 * Every access need, in a fixed order, whatever the record holds.
 *
 * The previous version filtered to `record.access[need] !== undefined` and
 * rendered nothing for the rest. That is the failure this session exists to
 * remove: the absence was the most useful thing on the page and it was the one
 * thing the page did not show.
 */
export function accessRows(
  record: ExperienceV2,
  label: (need: AccessNeed) => string,
): AccessRow[] {
  return ACCESS_NEEDS.map((need) => {
    const verdict = verdictFor(record.access[need]);
    return { need, label: label(need), verdict };
  });
}

/** How many needs are recorded at all, in either direction. */
export function accessRecordedCount(record: ExperienceV2): number {
  return ACCESS_NEEDS.filter((need) => record.access[need] !== undefined).length;
}

/* the mixed state, which must never collapse ------ */

export interface FieldCount {
  verified: number;
  estimated: number;
  unknown: number;
  total: number;
  mixed: boolean;
}

/**
 * Count the fields by how much they can be trusted.
 *
 * A record with real OpenStreetMap coordinates and a hash-derived price is not
 * "verified". It is partly verified, and the chip has to say so with a count.
 * Collapsing it to a single state is how 1107 records ended up summarising
 * themselves as verified when roughly 96 percent of their values are generated.
 */
export function fieldCount(record: ExperienceV2): FieldCount {
  const fields = Object.keys(FIELD_LABEL) as ProvenancedField[];
  let verified = 0;
  let estimated = 0;
  let unknown = 0;
  for (const field of fields) {
    const confidence = record.confidence[field] ?? "unverified";
    if (confidence === "verified" || confidence === "community") verified += 1;
    else if (confidence === "estimate") estimated += 1;
    else unknown += 1;
  }
  return {
    verified,
    estimated,
    unknown,
    total: fields.length,
    mixed: verified < fields.length,
  };
}

/** True when no field on the record carries a source we can name. */
export function whollyUnverified(record: ExperienceV2): boolean {
  return fieldCount(record).verified === 0;
}

/* the table ------ */

/** The graded fields, in the order a planner actually reads them. */
export function gradedRows(record: ExperienceV2): GradedRow[] {
  return [
    durationSummary(record),
    hoursSummary(record),
    priceSummary(record),
    pricePerPersonSummary(record),
    capacitySummary(record),
    bookingSummary(record),
    indoorSummary(record),
    kidFriendlySummary(record),
    bestTimeSummary(record),
    dietSummary(record),
    seasonSummary(record),
    ratingSummary(record),
    reviewCountSummary(record),
    coordinatesSummary(record),
  ];
}

export const GRADED_ROW_COUNT = gradedRows.length;

/** How many rows on this record are an honest absence rather than a value. */
export function absenceCount(record: ExperienceV2): number {
  return gradedRows(record).filter((row) => verdictOf(row) === "not-recorded").length;
}

export { FIELD_LABEL };
