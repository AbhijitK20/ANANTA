import type { HoursWindow, Rejection } from "@/lib/engine/contracts";
import { fieldCause, reject } from "../sentence";
import type { Check } from "./index";

/**
 * Opening hours. A visit must sit entirely inside an open window, not merely
 * overlap it, because a traveller who arrives 20 minutes before closing gets
 * 20 minutes, not the booked duration.
 */

const MINUTES_PER_DAY = 1440;

type Interval = readonly [number, number];

/**
 * Minutes of `[startMin, endMin)` that fall outside every open interval.
 * Zero means the whole visit is inside opening hours.
 *
 * Intervals on the following weekday are shifted forward by a day so a window
 * that runs past midnight, such as 23:00 to 02:00, covers the tail of the
 * visit.
 */
function uncoveredMinutes(intervals: Interval[], startMin: number, endMin: number): number {
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let missed = 0;
  let cursor = startMin;
  for (const [from, to] of sorted) {
    if (to <= cursor) continue;
    if (from >= endMin) break;
    if (from > cursor) missed += Math.min(from, endMin) - cursor;
    cursor = Math.max(cursor, Math.min(to, endMin));
    if (cursor >= endMin) break;
  }
  if (cursor < endMin) missed += endMin - cursor;
  return Math.max(0, missed);
}

export const checkHours: Check = (record, ctx, position) => {
  const rejections: Rejection[] = [];
  const cause = fieldCause(record, "openingHours");
  const { openingHours } = record;

  // Unverified hours are surfaced, never assumed. Session 1 marks this code
  // advisory, so an unverified record stays in the pool carrying the doubt.
  if (openingHours.confidence === "unverified") {
    rejections.push(reject("hours_unverified", {}, cause));
  }

  const today = record.openingHours.weekly[position.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6] ?? [];
  if (!today.length) {
    rejections.push(reject("closed_now", {}, cause));
    return rejections;
  }

  const tomorrow = ((position.weekday + 1) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const nextDay = record.openingHours.weekly[tomorrow] ?? [];
  const intervals: Interval[] = [
    ...today.map((w: HoursWindow): Interval => [w.from, w.to]),
    ...nextDay.map((w: HoursWindow): Interval => [w.from + MINUTES_PER_DAY, w.to + MINUTES_PER_DAY]),
  ];

  const missed = uncoveredMinutes(intervals, position.window.startMin, position.window.endMin);
  if (missed > 0) {
    rejections.push(reject("closed_during_window", { shortfall: missed, unit: "minutes" }, cause));
  }
  return rejections;
};
