import { fieldCause, reject } from "../sentence";
import type { Check } from "./index";

/**
 * Season. A record with no season window is not seasonal, so it is never
 * rejected here. The flamingo bug was a birdwatching point whose season fact
 * was ignored, which is exactly what this check reads.
 *
 * Monsoon exposure is deliberately not handled here: rain on an outdoor record
 * is a weather fact and lives in `weather.ts`, so charging it twice would let
 * one condition produce two competing rejections.
 */
export const checkSeason: Check = (record, _ctx, position) => {
  const season = record.season;
  if (!season || !season.months.length) return [];
  if (season.months.includes(position.month)) return [];

  return [reject(
    "seasonal_mismatch",
    season.note ? { extra: season.note } : {},
    fieldCause(record, "seasonality"),
  )];
};
