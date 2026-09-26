/**
 * Candidate selection: the union of three retrievers, ranked, and labelled with
 * the reason each id surfaced.
 *
 * BM25 ranks by text, facets narrow by structure, and the isochrone is a hard
 * travel-time filter. The union is the point: any one of the three alone is
 * blind to something the other two see, and the UI needs to be able to say which
 * one produced a card rather than pretending a single opaque rank did.
 */

import type { TravelMode } from "@/lib/engine/contracts";
import { FACET_DIMENSIONS, type FacetDimension } from "./facets";
import { phraseBoost, type SearchIndex } from "./index-builder";
import { isochroneIds, nearestNeighbourhood, reachableFrom, type TravelPoint } from "./isochrone";
import { foldForMatch, tokenize } from "./tokenize";

/**
 * The mode the prefilter assumes. `RetrieveOptions` carries no travel mode, so
 * this is a fixed choice and not a default that can be overridden: walking is
 * the only mode whose estimate cannot overstate reachability, which makes it
 * the safe assumption for a filter that is allowed to remove records.
 * `SESSION/BLOCKERS/2.md` proposes a `travelMode` field on `RetrieveOptions`.
 */
export const DEFAULT_TRAVEL_MODE: TravelMode = "walk";

/** How many nearest records a bare browse call considers when no budget is set. */
export const BROWSE_POOL = 120;

export interface RetrieveOptions {
  query: string;
  area?: string;
  categories?: string[];
  tags?: string[];
  origin: [number, number];
  /** Minutes. Travel-time prefilter. Uses the manifest congestion, never a raw radius. */
  maxTravelMinutes?: number;
  limit: number;
}

export type RetrieveVia = "bm25" | "facet" | "isochrone" | "union";

export interface RetrieveResult {
  ids: string[];
  /** BM25 score plus phrase boost per id. Absent for ids that did not match the text. */
  scores: Record<string, number>;
  /** Which retriever produced each id. `union` means more than one. */
  via: Record<string, RetrieveVia>;
  /** Records the stage actually looked at, after the isochrone filter. */
  totalConsidered: number;
}

interface TagConstraint {
  dimension: FacetDimension | null;
  value: string;
}

interface FacetConstraints {
  area: string | null;
  categories: string[];
  tags: TagConstraint[];
}

/**
 * Retrieve candidates for one query.
 *
 * `maxTravelMinutes` is a floor, never a hint: an id outside the isochrone does
 * not appear even when its text score is the highest in the corpus. When no
 * budget is set the isochrone stops filtering and becomes the tiebreak, so a
 * facet-only call ranks by affinity to the origin.
 *
 * `limit` caps `ids` only. `scores` covers every id that scored, including the
 * ones past the limit, so the UI can offer a runner-up it did not render.
 */
export function retrieve(index: SearchIndex, options: RetrieveOptions): RetrieveResult {
  const manifest = index.manifest ?? null;
  const budget =
    typeof options.maxTravelMinutes === "number" && options.maxTravelMinutes >= 0
      ? options.maxTravelMinutes
      : null;
  const constraints = parseConstraints(options);
  const foldedQuery = foldForMatch(options.query);
  const queryTokens = tokenize(options.query);
  const hasFacetFilter = constraints.area !== null || constraints.categories.length > 0 || constraints.tags.length > 0;

  const origin: TravelPoint = { coordinates: options.origin };
  const anchor = manifest ? nearestNeighbourhood(origin, manifest) : null;
  if (anchor) origin.area = anchor.name;

  const allRecords = Array.from(index.records.values());

  // Hard prefilter. Nothing below this line may reintroduce a dropped id.
  let pool: readonly string[] = index.ids;
  if (manifest && budget !== null) {
    const inside = new Set<string>(isochroneIds(origin, budget, DEFAULT_TRAVEL_MODE, manifest, allRecords));
    pool = index.ids.filter((id) => inside.has(id));
  }

  const minutesById = new Map<string, number>();
  if (manifest) {
    for (const id of pool) {
      const record = index.records.get(id);
      if (!record) continue;
      const estimate = reachableFrom(origin, { coordinates: record.coordinates, area: record.area }, DEFAULT_TRAVEL_MODE, manifest);
      if (estimate.reachable) minutesById.set(id, estimate.minutes);
    }
  }

  const scores: Record<string, number> = {};
  const sources = new Map<string, Set<RetrieveVia>>();
  const mark = (id: string, source: RetrieveVia): void => {
    const set = sources.get(id);
    if (set) set.add(source);
    else sources.set(id, new Set([source]));
  };

  if (queryTokens.length > 0) {
    for (const id of pool) {
      const total = index.bm25.score(queryTokens, id) + phraseBoost(index, id, foldedQuery);
      if (total > 0) {
        scores[id] = total;
        mark(id, "bm25");
      }
    }
  }

  if (hasFacetFilter) {
    for (const id of pool) {
      const values = index.facets.get(id);
      if (!values) continue;
      if (matchesFacets(values, constraints)) mark(id, "facet");
    }
  }

  // The isochrone is the source only when nothing else is: a bare browse call
  // with no text and no filters is asking for what is nearby.
  if (!hasFacetFilter && queryTokens.length === 0 && budget === null) {
    const nearest = Array.from(minutesById.keys())
      .sort((a, b) => (minutesById.get(a) as number) - (minutesById.get(b) as number) || a.localeCompare(b))
      .slice(0, BROWSE_POOL);
    for (const id of nearest) mark(id, "isochrone");
  }

  const ranked = Array.from(sources.keys())
    .map((id) => ({ id, score: scores[id] ?? 0, minutes: minutesById.get(id) ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => b.score - a.score || a.minutes - b.minutes || a.id.localeCompare(b.id));

  const via: Record<string, RetrieveVia> = {};
  for (const entry of ranked) {
    const set = sources.get(entry.id) as Set<RetrieveVia>;
    const only = Array.from(set);
    via[entry.id] = only.length > 1 ? "union" : only[0];
  }

  const limit = options.limit > 0 ? Math.floor(options.limit) : 0;
  return { ids: ranked.slice(0, limit).map((entry) => entry.id), scores, via, totalConsidered: pool.length };
}

function parseConstraints(options: RetrieveOptions): FacetConstraints {
  const area = options.area && options.area.trim().length > 0 ? options.area.trim().toLowerCase() : null;
  const categories = (options.categories ?? []).map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0);
  const tags = (options.tags ?? []).map(parseTag).filter((tag): tag is TagConstraint => tag !== null);
  return { area, categories, tags };
}

/** `area:kharghar` is a scoped tag; `kharghar` matches the value in any dimension. */
function parseTag(tag: string): TagConstraint | null {
  const trimmed = tag.trim();
  if (trimmed.length === 0) return null;
  const colon = trimmed.indexOf(":");
  if (colon > 0) {
    const head = trimmed.slice(0, colon).toLowerCase();
    if ((FACET_DIMENSIONS as readonly string[]).indexOf(head) >= 0) {
      return { dimension: head as FacetDimension, value: trimmed.slice(colon + 1).trim().toLowerCase() };
    }
  }
  return { dimension: null, value: trimmed.toLowerCase() };
}

function hasValue(values: readonly string[] | undefined, wanted: string): boolean {
  if (!values) return false;
  for (const value of values) if (value.toLowerCase() === wanted) return true;
  return false;
}

function matchesFacets(values: Partial<Record<FacetDimension, readonly string[]>>, constraints: FacetConstraints): boolean {
  if (constraints.area !== null && !hasValue(values.area, constraints.area)) return false;
  for (const category of constraints.categories) if (!hasValue(values.category, category)) return false;
  for (const tag of constraints.tags) {
    if (tag.dimension !== null) {
      if (!hasValue(values[tag.dimension], tag.value)) return false;
    } else {
      const found = FACET_DIMENSIONS.some((dimension) => hasValue(values[dimension], tag.value));
      if (!found) return false;
    }
  }
  return true;
}
