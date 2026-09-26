import type {
  DiscoveryContext,
  OpeningHours,
  Stop,
  ValidationIssue,
} from "@/lib/engine/contracts/types";

/**
 * The time half of the independent feasibility re-derivation.
 *
 * Nothing here imports the gate in `feasibility/`. The point of this session is
 * that the hard constraints have two independent derivations, so the checker
 * may not stand on the thing it is checking. A shared helper is a single point
 * of failure wearing a lab coat.
 *
 * ponytail: the sentences below are written here rather than pulled from
 * `contracts/codes.ts`, because the four validation-only codes
 * (`empty_plan`, `window_overflow`, `objective_drift`, `budget_overflow`) are
 * not `RejectionCode`s and have no home in that table. Once session 1 lands
 * `codes.ts`, the six codes that *are* `RejectionCode`s should switch to
 * `REJECTION_CODES[code].sentence(...)`. Logged in SESSION/BLOCKERS/6.md.
 */

const MINUTES_PER_DAY = 1440;
const CLOCK = /^(\d{1,2}):(\d{2})/;
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Signed minutes from `now` to `deadline`.
 *
 * A deadline that carries a date is compared as a real instant, so a deadline
 * already in the past returns a negative number and the caller decides what to
 * do about it. Nothing here wraps forward, which is the whole defect in
 * `lib/plan.ts:101`.
 *
 * A bare `HH:MM` deadline carries no date, so the only readable intent is the
 * next occurrence, including across midnight. That case wraps forward by
 * construction and is documented rather than accidental.
 */
export function minutesUntil(now: string, deadline: string): number {
  const clock = CLOCK.exec(now);
  const target = CLOCK.exec(deadline);
  if (clock && target) {
    const from = Number(clock[1]) * 60 + Number(clock[2]);
    const to = Number(target[1]) * 60 + Number(target[2]);
    const forward = (to - from + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    return forward;
  }
  const fromMs = Date.parse(now);
  const toMs = Date.parse(deadline);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return (toMs - fromMs) / 60000;
}

/** Minutes from local midnight, read from the text of the ISO string. */
export function minutesOfDay(iso: string): number {
  const match = /T(\d{1,2}):(\d{2})/.exec(iso);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function dayOfWeek(iso: string): Weekday {
  const parsed = new Date(iso);
  const day = parsed.getUTCDay();
  return ((day % 7) + 7) % 7 as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export function clockLabel(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const mm = String(Math.round(wrapped % 60)).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Total minutes a plan consumes, travel and buffer included. */
export function consumedMinutes(stops: readonly Stop[]): number {
  let total = 0;
  for (const stop of stops) {
    total += stop.travelMinutes + stop.visitMinutes + stop.bufferMinutes;
  }
  return total;
}

/**
 * Minutes from the start of the plan to the moment of arrival at stop `index`.
 * That includes the travel to the stop itself, which is the number a booking
 * lead time has to be measured against.
 */
export function arrivalOffsetMinutes(stops: readonly Stop[], index: number): number {
  let offset = 0;
  for (let i = 0; i < index; i += 1) {
    offset +=
      stops[i].travelMinutes + stops[i].visitMinutes + stops[i].bufferMinutes;
  }
  return offset + (stops[index] ? stops[index].travelMinutes : 0);
}

function isOpen(
  hours: OpeningHours,
  day: Weekday,
  nextDay: Weekday,
  start: number,
  minutes: number,
): boolean {
  const end = start + minutes;
  const days: [Weekday, number][] = [
    [day, 0],
    [nextDay, MINUTES_PER_DAY],
  ];
  for (const [which, shift] of days) {
    const windows = hours.weekly[which];
    if (!windows) continue;
    for (const window of windows) {
      if (start >= window.from + shift && end <= window.to + shift) return true;
    }
  }
  return false;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Re-derives the time constraints from `ctx` and the raw records:
 *
 *   - a plan with no stops is not a plan
 *   - stops must not overlap, and each must start no earlier than the previous
 *     one ended
 *   - every visit window must sit inside a listed opening window
 *   - unverified hours may not satisfy a hard constraint
 *   - the total must fit `availableMinutes`
 *   - the total must fit the deadline when one is set
 */
export function checkWindows(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
): ValidationIssue[] {
  if (stops.length === 0) {
    return [
      {
        code: "empty_plan",
        sentence: "No stops to check, so there is nothing to validate.",
        offendingId: null,
      },
    ];
  }
  return [
    ...checkTimeBudget(stops, ctx),
    ...checkDeadline(stops, ctx),
    ...checkOverlap(stops),
    ...checkOpeningHours(stops, ctx),
  ];
}

/** The plan must fit `ctx.availableMinutes`. */
export function checkTimeBudget(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
): ValidationIssue[] {
  const total = consumedMinutes(stops);
  const over = rounded(total - ctx.availableMinutes);
  if (over <= 0) return [];
  return [
    {
      code: "window_overflow",
      sentence: `The plan needs ${Math.round(total)} min but only ${Math.round(
        ctx.availableMinutes,
      )} min are available, ${Math.round(over)} min too many.`,
      offendingId: null,
    },
  ];
}

/** The plan must fit the return time, when one is set. */
export function checkDeadline(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
): ValidationIssue[] {
  if (ctx.deadline === null) return [];
  const total = consumedMinutes(stops);
  const allowed = minutesUntil(ctx.now, ctx.deadline);
  if (total <= allowed) return [];
  return [
    {
      code: "window_overflow",
      sentence: `The plan needs ${Math.round(total)} min but the ${clockLabel(
        minutesOfDay(ctx.deadline),
      )} return leaves ${Math.round(allowed)} min, ${Math.round(
        rounded(total - allowed),
      )} min too many.`,
      offendingId: null,
    },
  ];
}

/** No stop may begin before the one before it has finished. */
export function checkOverlap(stops: readonly Stop[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let previousEnd = Number.NEGATIVE_INFINITY;
  for (const stop of stops) {
    if (stop.arriveBy < previousEnd) {
      issues.push({
        code: "window_overflow",
        sentence: `${stop.record.name} starts at ${clockLabel(
          stop.arriveBy,
        )} but the previous stop runs until ${clockLabel(
          previousEnd,
        )}, an overlap of ${Math.round(previousEnd - stop.arriveBy)} min.`,
        offendingId: stop.record.id,
      });
    }
    previousEnd =
      stop.arriveBy + stop.visitMinutes + stop.bufferMinutes;
  }
  return issues;
}

/** Every visit must sit inside a listed opening window, and unverified hours
 *  may not satisfy a hard constraint. */
export function checkOpeningHours(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const day = dayOfWeek(ctx.now);
  const nextDay = ((day + 1) % 7) as Weekday;
  for (const stop of stops) {
    const record = stop.record;
    if (record.openingHours.confidence === "unverified") {
      issues.push({
        code: "hours_unverified",
        sentence: `${record.name} has unverified opening hours, so the ${Math.round(
          stop.visitMinutes,
        )} min visit at ${clockLabel(stop.arriveBy)} cannot be confirmed.`,
        offendingId: record.id,
      });
      continue;
    }
    if (
      !isOpen(record.openingHours, day, nextDay, stop.arriveBy, stop.visitMinutes)
    ) {
      issues.push({
        code: "closed_during_window",
        sentence: `${record.name} is listed open only ${describeHours(
          record.openingHours,
          day,
        )}, and the visit runs ${clockLabel(stop.arriveBy)} to ${clockLabel(
          stop.arriveBy + stop.visitMinutes,
        )}.`,
        offendingId: record.id,
      });
    }
  }
  return issues;
}

function describeHours(hours: OpeningHours, day: Weekday): string {
  const windows = hours.weekly[day];
  if (!windows || windows.length === 0) return "closed on that day";
  return windows
    .map((window) => `${clockLabel(window.from)} to ${clockLabel(window.to)}`)
    .join(", ");
}

/**
 * Weather and availability, re-derived from the raw records.
 *
 * Outdoor stops are refused under `heavy_rain` and `storm`. Under `rain` they
 * stand and the UI is free to warn. When the weather is unknown nothing is
 * refused, because unknown is not `false`.
 *
 * This is the check `lib/plan.ts:44` computes and then never uses.
 *
 * ponytail: the sold-out comparison is only exact when `ctx.now` and
 * `availability.soldOutAt` carry the same UTC offset form, because JavaScript
 * reads an offset-less timestamp as host local time. Converting through
 * `ctx.city.timezone` properly needs a timezone database, which would be a new
 * dependency. Upgrade path is one injected offset in minutes.
 */
export function checkConditions(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const severity = ctx.weatherSeverity;
  const wet = severity === "heavy_rain" || severity === "storm";
  const startMs = Date.parse(ctx.now);

  for (let i = 0; i < stops.length; i += 1) {
    const stop = stops[i];
    const record = stop.record;
    if (wet && record.indoor === "outdoor") {
      issues.push({
        code: "weather_unsafe",
        sentence: `${record.name} is outdoors and the forecast is ${String(
          severity,
        ).replace("_", " ")}, so an outdoor stop cannot be validated.`,
        offendingId: record.id,
      });
    }
    const soldOutAt = record.availability.soldOutAt;
    if (soldOutAt !== null && Number.isFinite(startMs)) {
      const soldOutMs = Date.parse(soldOutAt);
      const reachesMs = startMs + arrivalOffsetMinutes(stops, i) * 60000;
      if (Number.isFinite(soldOutMs) && reachesMs >= soldOutMs) {
        issues.push({
          code: "sold_out",
          sentence: `${record.name} is sold out from ${soldOutAt} and the plan reaches it at ${clockLabel(
            stop.arriveBy,
          )}.`,
          offendingId: record.id,
        });
      }
    }
  }

  return issues;
}
