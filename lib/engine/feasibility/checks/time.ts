import type { DiscoveryContext, ExperienceV2 } from "@/lib/engine/contracts";
import { reject } from "../sentence";
import type { Check } from "./index";

/**
 * Every temporal decision in the gate lives here: the shared buffer constant,
 * the minute budget, the travel-time number, and the conversion from an
 * absolute instant to a local wall clock. One owner, so no other module can
 * disagree about what time it is.
 */

/**
 * Minutes held back per plan, not per stop. `lib/recommendation.ts:37` and
 * `lib/plan.ts:39` each hardcoded 15 and agreed by luck.
 * ponytail: session 9 must use this constant in the feasibility meter so the
 * UI and the gate can never show different totals for the same plan.
 */
export const DEFAULT_BUFFER_MINUTES = 15;

const MINUTES_PER_DAY = 1440;

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * The minutes the traveller actually has, which is the smaller of the stated
 * availability and the time left before the deadline. Pure: `ctx.now` is
 * injected and no wall clock is read.
 */
export function budgetMinutes(ctx: DiscoveryContext): number {
  if (!ctx.deadline) return Math.max(0, ctx.availableMinutes);
  const untilDeadline = (Date.parse(ctx.deadline) - Date.parse(ctx.now)) / 60000;
  if (!Number.isFinite(untilDeadline)) return Math.max(0, ctx.availableMinutes);
  return Math.max(0, Math.min(ctx.availableMinutes, untilDeadline));
}

/**
 * Travel time for one leg, with the city manifest's congestion multiplier for
 * the traveller's mode applied exactly once.
 * ponytail: sessions 2 (prefilter) and 5 (packing) must also route through
 * this function, otherwise the gate admits a leg packing then cannot afford.
 */
export function travelMinutesFor(record: ExperienceV2, ctx: DiscoveryContext): number {
  const raw = record.travelMinutes;
  if (!Number.isFinite(raw)) return Number.NaN;
  return Math.max(0, raw * ctx.city.congestion[ctx.travelMode]);
}

/**
 * Local wall clock at `now` in the manifest's timezone, plus the weekday and
 * month. `Intl` is stdlib and the only honest way to honour a city timezone
 * without a date library.
 * ponytail: formatter is rebuilt per call. At ~120 candidates per gate run
 * this is noise; a cache keyed by timezone is the upgrade if it ever shows up
 * in a profile.
 */
export function localClock(now: string, timezone: string): { weekday: number; minutes: number; month: number } {
  const when = new Date(now);
  // `Intl` throws on an invalid date, and one malformed `ctx.now` must not take
  // the whole gate down. Midnight on a Sunday is the least asserting answer.
  const degenerate = { weekday: 0, minutes: 0, month: 1 };
  if (Number.isNaN(when.getTime())) return degenerate;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(when);

  const read: Record<string, string> = {};
  for (const part of parts) if (part.type !== "literal") read[part.type] = part.value;

  // en-US with hour12:false reports midnight as hour 24.
  const hour = Number(read.hour) % 24;
  const minute = Number(read.minute);
  const minuteOfDay = hour * 60 + (Number.isFinite(minute) ? minute : 0);

  return {
    weekday: WEEKDAY_INDEX[read.weekday] ?? 0,
    minutes: Number.isFinite(minuteOfDay) ? minuteOfDay : 0,
    month: Number(read.month) || 1,
  };
}

export interface NormalisedWindow {
  /** Minutes from local midnight, always >= 0. */
  startMin: number;
  /** Exclusive end, may exceed 1440 when the visit crosses midnight. */
  endMin: number;
  /** -1 when the window starts before today and belongs to yesterday. */
  dayShift: number;
}

/**
 * Turns any caller-supplied window into one comparable to `HoursWindow`.
 * Handles the two ways a window can cross midnight: an end at or before the
 * start (the caller already wrapped it), and a start before local midnight
 * (the plan began yesterday, so the weekday shifts back one).
 */
export function normaliseWindow(startMin: number, endMin: number): NormalisedWindow {
  let start = startMin;
  let end = endMin;
  let dayShift = 0;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { startMin: 0, endMin: 0, dayShift: 0 };
  if (end <= start) end += MINUTES_PER_DAY;
  if (start < 0) {
    start += MINUTES_PER_DAY;
    end += MINUTES_PER_DAY;
    dayShift = -1;
  }
  return { startMin: start, endMin: end, dayShift };
}

/** Arrive as soon as travel allows, stay for the record's own duration. */
export function defaultWindowFor(ctx: DiscoveryContext) {
  const clock = localClock(ctx.now, ctx.city.timezone);
  return (record: ExperienceV2): { startMin: number; endMin: number } => {
    const travel = travelMinutesFor(record, ctx);
    const startMin = clock.minutes + (Number.isFinite(travel) ? travel : 0);
    return { startMin, endMin: startMin + record.durationMinutes };
  };
}

/**
 * `travel + duration + buffer <= budgetMin`, attributed to the leg that caused
 * the overflow. The buffer is added once, here, and nowhere else.
 */
export const checkTime: Check = (record, ctx, position) => {
  const budget = budgetMinutes(ctx);
  const travel = position.travelMinutes;
  if (!Number.isFinite(travel) || travel < 0) return [];
  const visit = record.durationMinutes;
  const need = travel + visit + DEFAULT_BUFFER_MINUTES;
  if (need <= budget) return [];

  const shortfall = need - budget;
  // Travel binds when travel alone with the buffer busts the budget, or when
  // neither leg does on its own and travel is the larger of the two. Ties go
  // to travel so the code is a pure function of the input.
  const durationBinds = travel + DEFAULT_BUFFER_MINUTES <= budget
    && (visit + DEFAULT_BUFFER_MINUTES > budget || visit > travel);

  return [reject(
    durationBinds ? "duration_exceeds_budget" : "travel_time_exceeds_budget",
    { shortfall, unit: "minutes" },
    { provenance: record.provenance.duration, confidence: record.confidence.duration ?? "estimate" },
  )];
};
