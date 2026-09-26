/**
 * Facet layer: the countable dimensions the explore UI filters on.
 *
 * Every value is read off a record. Nothing here knows a city, a neighbourhood
 * or a price band of a particular place, which is the property that makes
 * adding a second city a data change and not a code change.
 */

import type { ExperienceV2 } from "@/lib/engine/contracts";
import type { SearchIndex } from "./index-builder";

/** The dimensions a facet count can be taken over, in render order. */
export const FACET_DIMENSIONS = [
  "category",
  "area",
  "zone",
  "station",
  "city",
  "bestTimeOfDay",
  "access",
  "diet",
  "indoor",
  "priceBand",
  "kidFriendly",
] as const;

export type FacetDimension = typeof FACET_DIMENSIONS[number];

export const PRICE_BANDS = ["free", "under-200", "200-600", "600-1500", "1500-plus", "unknown"] as const;

export type PriceBand = typeof PRICE_BANDS[number];

/**
 * Bucket a price. `null`, `NaN`, `Infinity` and negative prices land in
 * `unknown`, never in `free`: an absent price is not a free price, and folding
 * one into the other is the exact dishonesty the rest of this engine is built
 * against. A price of exactly 0 is a stated free entry and stays in `free`.
 */
export function priceBand(price: number | null | undefined): PriceBand {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) return "unknown";
  if (price === 0) return "free";
  if (price < 200) return "under-200";
  if (price < 600) return "200-600";
  if (price < 1500) return "600-1500";
  return "1500-plus";
}

/** `true | false | null` collapses to a countable value without a fake default. */
export function kidFriendlyFacet(value: boolean | null): "yes" | "no" | "unknown" {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

/** Every facet value a record carries, sorted within each dimension so the
 * stored form does not depend on object key order. */
export function facetValuesOf(record: ExperienceV2): Record<FacetDimension, string[]> {
  const access = Object.keys(record.access)
    .filter((need) => record.access[need as keyof typeof record.access] === true)
    .sort();
  return {
    category: clean(record.category),
    area: clean(record.area),
    zone: clean(record.zone),
    station: clean(record.station),
    city: clean(record.city),
    bestTimeOfDay: clean(record.bestTimeOfDay),
    access,
    diet: Array.from(new Set(cleanAll(record.diets))).sort(),
    indoor: clean(record.indoor),
    priceBand: [priceBand(record.priceInr)],
    kidFriendly: [kidFriendlyFacet(record.kidFriendly)],
  };
}

/** Drop empty values so a record with no station does not create a `""` facet. */
function clean(value: string): string[] {
  return value.length > 0 ? [value] : [];
}

function cleanAll(values: readonly string[]): string[] {
  return values.filter((value) => value.length > 0);
}

export interface FacetCount {
  value: string;
  count: number;
}

/**
 * Count the values of one dimension, optionally restricted to a set of ids so
 * the UI can show counts that respect the filters already applied.
 *
 * Sorted by count descending, then value ascending, so the render is stable and
 * two equal counts never swap places between frames.
 *
 * Counting walks the ids rather than an inverted table. At 1107 records and 11
 * dimensions that is about 12k increments per call, well under a millisecond,
 * and it keeps one copy of the data instead of two.
 *
 * ponytail: the whole index is rescanned per call, so a UI that renders all 11
 * counts for every keystroke pays 11 walks. Upgrade path: an inverted
 * `dimension -> value -> ids` table, built once, when the catalogue reaches
 * five figures.
 */
export function facetCounts(
  index: SearchIndex,
  dimension: FacetDimension,
  filteredIds?: Iterable<string> | null,
): FacetCount[] {
  const restrict = filteredIds ? new Set<string>(filteredIds) : null;
  const counts = new Map<string, number>();
  for (const id of index.ids) {
    if (restrict && !restrict.has(id)) continue;
    const values = index.facets.get(id);
    if (!values) continue;
    const bucket = values[dimension];
    if (!bucket) continue;
    for (const value of bucket) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
