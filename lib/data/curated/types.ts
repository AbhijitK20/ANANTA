import type {
  AccessNeed,
  Confidence,
  DietNeed,
  HoursWindow,
  IndoorOutdoor,
  SeasonWindow,
} from "@/lib/engine/contracts";

/**
 * The Experience layer: the facts OpenStreetMap does not carry.
 *
 * OSM knows a thing exists and roughly where. It does not know how long a visit
 * takes, what it costs, whether the entrance has steps, whether a vegetarian
 * option exists, or whether the thing is open on a Tuesday. Those are the fields
 * a planner actually needs, and they are the fields this directory hand-authors.
 *
 * The rule for every value below: write it only if you actually know it. `null`
 * means unknown, and unknown is a first-class answer here. A record that
 * abstains on capacity is safe for the gate to reason about. A record that
 * guesses a capacity will be trusted and will be wrong.
 */

/** 0 = Sunday. Matches the `OpeningHours.weekly` key type in the contracts. */
export type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type WeeklyHours = Partial<Record<Day, HoursWindow[]>>;

export interface CuratedFacts {
  /** The record id, matching the slug of the name in `lib/data/places/*.ts`. */
  id: string;
  durationMinutes: number;
  priceInr: number;
  /** `null` when genuinely free, or when the per-head price is not known. */
  pricePerPersonInr: number | null;
  capacity: number | null;
  openingHours: { weekly: WeeklyHours; confidence: Confidence };
  access: Partial<Record<AccessNeed, boolean>>;
  diets: DietNeed[];
  indoor: IndoorOutdoor;
  kidFriendly: boolean | null;
  season: SeasonWindow | null;
  bestTimeOfDay: "morning" | "afternoon" | "evening" | "night" | "any";
  ratingSum: number | null;
  reviewCount: number | null;
  authenticity: number | null;
  crowdProfile: number | null;
  asOf: string;
  /** Plain sentence saying how you know. Shown verbatim in the provenance popover. */
  reviewerNote: string;
}

/** Minutes from local midnight, so records read as `h(9)` rather than `540`. */
export const h = (hour: number, minute = 0): number => hour * 60 + minute;

const span = (from: number, to: number): HoursWindow[] => [{ from, to }];

/** Open the same window every day. */
export const daily = (from: number, to: number): WeeklyHours => ({
  0: span(from, to),
  1: span(from, to),
  2: span(from, to),
  3: span(from, to),
  4: span(from, to),
  5: span(from, to),
  6: span(from, to),
});

/** Open the same window on the listed days only. 0 is Sunday, 6 is Saturday. */
export const on = (days: Day[], from: number, to: number): WeeklyHours => {
  const out: WeeklyHours = {};
  for (const day of days) out[day] = span(from, to);
  return out;
};

/** Weekdays, one window. */
export const weekdays = (from: number, to: number): WeeklyHours => on([1, 2, 3, 4, 5], from, to);

/** Weekends only, one window. */
export const weekends = (from: number, to: number): WeeklyHours => on([0, 6], from, to);

/**
 * Shorthand for the common case where nothing is known yet. The record still
 * gets a real duration and a real indoor answer, but the schedule stays
 * unpublished so the gate can refuse on `hours_unverified` instead of trusting
 * an invented 10am to 7pm.
 */
export const noHours = { weekly: {} as WeeklyHours, confidence: "unverified" as const };

/** A street-level walk: step free, no seating, not bookable, free. */
export const walkFacts = (
  durationMinutes: number,
  bestTimeOfDay: CuratedFacts["bestTimeOfDay"],
  extras: Partial<CuratedFacts> = {},
): CuratedFacts => ({
  id: "",
  durationMinutes,
  priceInr: 0,
  pricePerPersonInr: 0,
  capacity: null,
  openingHours: noHours,
  access: { step_free: true, low_walking: true, service_animal_ok: true },
  diets: [],
  indoor: "outdoor",
  kidFriendly: null,
  season: null,
  bestTimeOfDay,
  ratingSum: null,
  reviewCount: null,
  authenticity: null,
  crowdProfile: null,
  asOf: "2026-09-20",
  reviewerNote: "",
  ...extras,
});

/** Any record's `season` for a thing that is only worth doing in the cool months. */
export const coolMonths = (note: string): SeasonWindow => ({ months: [11, 12, 1, 2, 3], note });
