/**
 * Builds the retrieval index the explore page builds once and shares.
 *
 * The index is immutable: every map is written during construction and exposed
 * as a `ReadonlyMap`, so a `useMemo` around `buildIndex` is safe and two
 * callers can never disagree about the corpus.
 */

import type { CityManifest, ExperienceV2 } from "@/lib/engine/contracts";
import { buildBM25, type BM25Document, type BM25Index, type IndexField } from "./bm25";
import { facetValuesOf, type FacetDimension } from "./facets";
import { foldForMatch } from "./tokenize";

/** Folded full name and folded full description per record. */
export interface PhraseIndex {
  readonly names: ReadonlyMap<string, string>;
  readonly descriptions: ReadonlyMap<string, string>;
}

/** recordId -> that record's facet values, per dimension. */
export type FacetValues = ReadonlyMap<string, Partial<Record<FacetDimension, readonly string[]>>>;

/**
 * The retrieval index. One object, one corpus, one build.
 *
 * `manifest` is null when the index was built without a city. It is on the
 * index rather than on `retrieve` because the frozen `retrieve` signature
 * carries no manifest and the isochrone prefilter needs the congestion
 * multipliers. A null manifest means no congestion adjustment is applied, which
 * is stated in `SESSION/BLOCKERS/2.md`.
 */
export interface SearchIndex {
  /** Every indexed id, ascending. The iteration order of the whole stage. */
  readonly ids: readonly string[];
  readonly records: ReadonlyMap<string, ExperienceV2>;
  readonly bm25: BM25Index;
  readonly phrases: PhraseIndex;
  readonly facets: FacetValues;
  readonly manifest: CityManifest | null;
}

/** Boost added when the whole folded query is a substring of the folded name. */
export const PHRASE_NAME_BOOST = 8;

/** Boost added when the whole folded query is a substring of the description. */
export const PHRASE_DESCRIPTION_BOOST = 1.5;

/**
 * Build the index from a record list. Frozen signature: one argument, no city.
 * See `withManifest` for attaching a city.
 */
export function buildIndex(records: ExperienceV2[]): SearchIndex {
  return assemble(records, null);
}

/**
 * The same index with a city attached, which is what enables the isochrone
 * prefilter. Returns a new object that shares every map with the index it came
 * from, so attaching a city costs one object literal and no rebuild.
 */
export function withManifest(index: SearchIndex, manifest: CityManifest): SearchIndex {
  return { ...index, manifest };
}

/** Build and attach a city in one call. What the UI should use. */
export function buildCityIndex(records: ExperienceV2[], manifest: CityManifest): SearchIndex {
  return withManifest(buildIndex(records), manifest);
}

function assemble(records: ExperienceV2[], manifest: CityManifest | null): SearchIndex {
  const byId = new Map<string, ExperienceV2>();
  for (const record of records) byId.set(record.id, record);
  const ids = Array.from(byId.keys()).sort();

  const documents: BM25Document[] = [];
  const names = new Map<string, string>();
  const descriptions = new Map<string, string>();
  const facets = new Map<string, Partial<Record<FacetDimension, readonly string[]>>>();

  for (const id of ids) {
    const record = byId.get(id) as ExperienceV2;
    documents.push({ id, fields: indexFields(record) });
    names.set(id, foldForMatch(record.name));
    descriptions.set(id, foldForMatch(record.description));
    facets.set(id, facetValuesOf(record));
  }

  return {
    ids,
    records: byId,
    bm25: buildBM25(documents),
    phrases: { names, descriptions },
    facets,
    manifest,
  };
}

/**
 * The nine text fields the BM25 pass reads. Access and diet needs are joined
 * into one string each so a query for `step_free` reaches a record that carries
 * the tag without the caller knowing which dimension produced it.
 */
function indexFields(record: ExperienceV2): Partial<Record<IndexField, string>> {
  const access = Object.keys(record.access)
    .filter((need) => record.access[need as keyof typeof record.access] === true)
    .sort()
    .join(" ");
  return {
    name: record.name,
    description: record.description,
    area: record.area,
    zone: record.zone,
    station: record.station,
    category: record.category,
    bestTimeOfDay: record.bestTimeOfDay,
    access,
    diet: record.diets.join(" "),
  };
}

/**
 * Exact-phrase boost for one record. A whole-query substring hit in the name
 * is worth more than any amount of scattered token overlap, which is what makes
 * "Sanjay Gandhi National Park" beat a park that mentions Sanjay Gandhi once.
 * Returns 0 for an empty query so an empty call never scores.
 */
export function phraseBoost(index: SearchIndex, id: string, foldedQuery: string): number {
  if (foldedQuery.length === 0) return 0;
  let boost = 0;
  const name = index.phrases.names.get(id);
  if (name !== undefined && name.includes(foldedQuery)) boost += PHRASE_NAME_BOOST;
  const description = index.phrases.descriptions.get(id);
  if (description !== undefined && description.includes(foldedQuery)) boost += PHRASE_DESCRIPTION_BOOST;
  return boost;
}
