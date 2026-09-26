import { fieldCause, reject } from "../sentence";
import type { Check } from "./index";

/**
 * Weather. This check only knows one thing, which is whether the record is
 * outdoors with nowhere to shelter. Ranking how pleasant rain is, or how
 * sheltered a mixed-venue record is, is session 4's weather component.
 */

const UNSAFE_SEVERITY: Record<string, true> = { rain: true, heavy_rain: true, storm: true };

export const checkWeather: Check = (record, ctx) => {
  // Unknown weather is not good weather and is not bad weather either. A null
  // severity must never reject an outdoor record, only rank it lower.
  if (ctx.weatherSeverity === null) return [];
  if (!UNSAFE_SEVERITY[ctx.weatherSeverity]) return [];
  // `indoor` is a fact about the place. The legacy gate read a 3-value
  // presentation token as a constraint bit, which is how an indoor history walk
  // got rejected on a rainy day for wanting a phone call. Never again.
  if (record.indoor !== "outdoor") return [];

  return [reject("weather_unsafe", {}, fieldCause(record, "indoor"))];
};
