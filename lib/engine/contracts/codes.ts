import type { RejectionCode, RejectionUnit } from "./types";

export interface CodeSpec {
  code: RejectionCode;
  /** Whether this can ever be non-blocking. */
  advisory: boolean;
  /** Build the finished sentence from measured numbers. */
  sentence: (m: { shortfall?: number; unit?: RejectionUnit; extra?: string }) => string;
}

/** Everything the sentence builders are given. All fields optional, always. */
type SentenceInput = Parameters<CodeSpec["sentence"]>[0];

export const REJECTION_UNIT_LABEL: Record<RejectionUnit, string> = {
  minutes: "minute",
  inr: "rupees",
  metres: "metre",
  km: "km",
  seats: "seat",
  days: "day",
  none: "",
};

export const REJECTION_UNIT_SUFFIX: Record<RejectionUnit, string> = {
  minutes: "min",
  inr: "",
  km: "km",
  metres: "m",
  seats: "seats",
  days: "days",
  none: "",
};

/** At most one decimal, so 42.0 reads as "42" and 42.5 reads as "42.5". */
const fmt = (value: number): string => String(Math.round(value * 10) / 10);

/** Exactly one of `unit`, so "1 seat short" never reads as "1 seats short". */
const ONE: Partial<Record<RejectionUnit, string>> = {
  minutes: "minute",
  inr: "rupee",
  metres: "metre",
  km: "km",
  seats: "seat",
  days: "day",
};

/**
 * The magnitude clause, or `null` when the shortfall carries no unit. A
 * shortfall is a magnitude by contract, so a negative one is floored at zero
 * rather than printed as a negative shortfall.
 */
const magnitude = (shortfall: number, unit: RejectionUnit): string | null => {
  const value = Math.max(0, shortfall);
  const token = value === 1 ? ONE[unit] ?? "" : REJECTION_UNIT_SUFFIX[unit] || REJECTION_UNIT_LABEL[unit];
  if (!token) return null;
  return `${fmt(value)} ${token} short`;
};

/**
 * One template for every sentence in the product.
 *
 * - `lead` is the claim, stated as a finished clause with a real fact in it.
 * - `extra` is the named detail only the caller knows: the station, the
 *   record's own hours, the diet asked for, the second number in a comparison.
 * - A measured `shortfall` becomes a trailing magnitude clause.
 * - With neither, the sentence still stands on `lead` alone. It never invents a
 *   number to fill a gap.
 */
const build =
  (lead: string, unit: RejectionUnit = "none") =>
  (m: SentenceInput): string => {
    const extra = m.extra?.trim();
    if (extra) return `${lead}: ${extra.replace(/[.\s]+$/, "")}.`;
    const short =
      m.shortfall === undefined || m.shortfall === null || !Number.isFinite(m.shortfall)
        ? null
        : magnitude(m.shortfall, m.unit ?? unit);
    return short ? `${lead}, ${short}.` : `${lead}.`;
  };

export const REJECTION_CODES: Record<RejectionCode, CodeSpec> = {
  too_far: {
    code: "too_far",
    advisory: false,
    sentence: build("Too far to fit your travel window", "minutes"),
  },
  travel_time_exceeds_budget: {
    code: "travel_time_exceeds_budget",
    advisory: false,
    sentence: build("Travel time does not fit the window you have left", "minutes"),
  },
  duration_exceeds_budget: {
    code: "duration_exceeds_budget",
    advisory: false,
    sentence: build("The visit itself is longer than the window you have left", "minutes"),
  },
  closed_now: {
    code: "closed_now",
    advisory: false,
    sentence: build("Closed right now"),
  },
  closed_during_window: {
    code: "closed_during_window",
    advisory: false,
    sentence: build("Closed for part of the visit window", "minutes"),
  },
  hours_unverified: {
    code: "hours_unverified",
    advisory: true,
    sentence: build("Opening hours are unverified, so we will not claim it is open"),
  },
  over_budget: {
    code: "over_budget",
    advisory: false,
    sentence: build("Costs more than you budgeted", "inr"),
  },
  over_budget_per_person: {
    code: "over_budget_per_person",
    advisory: false,
    sentence: build("Costs more per person than you budgeted", "inr"),
  },
  capacity_exceeded: {
    code: "capacity_exceeded",
    advisory: false,
    sentence: build("Seats fewer people than your party", "seats"),
  },
  not_step_free: {
    code: "not_step_free",
    advisory: false,
    sentence: build("No step-free route is recorded for this entrance"),
  },
  not_stroller_ok: {
    code: "not_stroller_ok",
    advisory: false,
    sentence: build("No stroller-friendly route is recorded here"),
  },
  no_accessible_restroom: {
    code: "no_accessible_restroom",
    advisory: false,
    sentence: build("No accessible restroom is recorded on site"),
  },
  requires_steps: {
    code: "requires_steps",
    advisory: false,
    sentence: build("This one has steps and no step-free alternative is recorded"),
  },
  no_seating: {
    code: "no_seating",
    advisory: false,
    sentence: build("No seating is recorded for the length of the visit"),
  },
  not_quiet_enough: {
    code: "not_quiet_enough",
    advisory: false,
    sentence: build("Not recorded as a quiet space and you asked for quiet"),
  },
  diet_mismatch: {
    code: "diet_mismatch",
    advisory: false,
    sentence: build("Cannot meet the dietary needs you listed"),
  },
  sold_out: {
    code: "sold_out",
    advisory: false,
    sentence: build("Sold out for the slot you would need"),
  },
  requires_booking_not_available: {
    code: "requires_booking_not_available",
    advisory: true,
    sentence: build("Takes a booking and no booking link is on record"),
  },
  lead_time_too_short: {
    code: "lead_time_too_short",
    advisory: false,
    sentence: build("Needs more notice than you are planning ahead", "minutes"),
  },
  weather_unsafe: {
    code: "weather_unsafe",
    advisory: false,
    sentence: build("Not safe in this weather"),
  },
  duplicate: {
    code: "duplicate",
    advisory: false,
    sentence: build("Already covered by a stop you have", "metres"),
  },
  already_planned: {
    code: "already_planned",
    advisory: false,
    sentence: build("Already in your plan"),
  },
  excluded_by_traveller: {
    code: "excluded_by_traveller",
    advisory: false,
    sentence: build("You excluded this one yourself"),
  },
  seasonal_mismatch: {
    code: "seasonal_mismatch",
    advisory: false,
    sentence: build("Out of season right now"),
  },
  no_route: {
    code: "no_route",
    advisory: false,
    sentence: build("No route reaches it in the time you have"),
  },
  unverified_required_fact: {
    code: "unverified_required_fact",
    advisory: true,
    sentence: build("A fact we would need is unverified, so we will not guess"),
  },
};

/**
 * Human sentence for one code, with the same input shape the table takes. The
 * gate and the unmet-demand feed both go through here so no stage ever writes
 * its own English for a rejection.
 */
export const rejectionSentence = (
  code: RejectionCode,
  m: SentenceInput = {},
): string => REJECTION_CODES[code].sentence(m);
