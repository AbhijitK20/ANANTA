/**
 * Okapi BM25 over an in-memory index.
 *
 * One index with a per-field term frequency multiplier, not four sub-indexes
 * combined. Reason: a sub-index per field means four document frequency
 * tables and four length norms, and combining them needs a second weight
 * vector that is, in the end, the same multiplier. One table also means a term
 * that appears only in `name` still gets one document frequency, so the IDF a
 * query term earns is a property of the corpus rather than of which field
 * happened to match. At 1107 records the whole index is a few hundred
 * kilobytes and a sub-millisecond scan.
 *
 * No native module. FTS5 was considered and rejected: it buys nothing at this
 * catalogue size and a `better-sqlite3` dependency is a build risk in a
 * Next.js app.
 */

import { tokenize, uniqueTokens } from "./tokenize";

/** Term frequency saturation. The usual Okapi value. */
export const K1 = 1.2;

/** Length normalisation strength. The usual Okapi value, and 0.75 is where
 * Lucene settled after measuring real corpora. */
export const B = 0.75;

/**
 * Indexed fields, most significant first. The ordering is the product
 * decision: a place named for the thing you searched beats a place that
 * mentions it once in its description, and a description beats the area and
 * station it happens to sit in.
 *
 * The facet-like fields are indexed as free text as well, so a query for
 * `step_free` or `jain` reaches a record that carries the tag without the
 * caller having to know which dimension it came from.
 */
export const FIELD_WEIGHTS = {
  name: 4,
  description: 2,
  area: 1.5,
  station: 1,
  category: 1,
  zone: 1,
  bestTimeOfDay: 0.5,
  access: 0.5,
  diet: 0.5,
} as const;

export type IndexField = keyof typeof FIELD_WEIGHTS;

/** One record reduced to the fields the index reads. */
export interface BM25Document {
  id: string;
  fields: Partial<Record<IndexField, string>>;
}

export interface BM25Index {
  readonly docCount: number;
  /** Mean unweighted token count across all documents. */
  readonly avgDocLength: number;
  /** docId -> unweighted token count. */
  readonly docLengths: ReadonlyMap<string, number>;
  /** term -> docId -> field weighted term frequency. */
  readonly postings: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** term -> number of documents the term appears in. */
  readonly docFreqs: ReadonlyMap<string, number>;
  readonly k1: number;
  readonly b: number;
  score(queryTokens: readonly string[], docId: string): number;
}

/**
 * Smoothed inverse document frequency, `ln(1 + (N - df + 0.5) / (df + 0.5))`.
 *
 * The unsmoothed form `ln((N - df + 0.5) / (df + 0.5))` goes negative once a
 * term appears in every document, and a negative IDF silently demotes the most
 * ubiquitous word in the corpus. With 1107 records and a handful of shared
 * category words that fires on the first real query. The `1 +` guarantees the
 * argument is above 1, so the result is never negative; for a term in every
 * document it collapses to `ln(1 + 0.5/(N+0.5))`, which is 0.0002 at this
 * catalogue size and correctly treated as zero by any ranking downstream.
 */
export function bm25Idf(docCount: number, docFreq: number): number {
  return Math.log(1 + (docCount - docFreq + 0.5) / (docFreq + 0.5));
}

/** Field order is fixed, so the build loop never re-derives it per document. */
const INDEXED_FIELDS = Object.keys(FIELD_WEIGHTS) as IndexField[];

/**
 * Build the index. Idempotent and cheap: the same records always produce the
 * same postings, and the result is safe to build once in a `useMemo` and share.
 *
 * Every map is written only during construction and is exposed as
 * `ReadonlyMap`, so the index cannot change after it is built.
 */
export function buildBM25(documents: readonly BM25Document[]): BM25Index {
  const postings = new Map<string, Map<string, number>>();
  const docFreqs = new Map<string, number>();
  const docLengths = new Map<string, number>();
  let totalLength = 0;

  for (const document of documents) {
    const weighted = new Map<string, number>();
    let length = 0;
    for (let i = 0; i < INDEXED_FIELDS.length; i += 1) {
      const field = INDEXED_FIELDS[i];
      const text = document.fields[field];
      if (!text) continue;
      const weight = FIELD_WEIGHTS[field];
      for (const token of tokenize(text)) {
        length += 1;
        weighted.set(token, (weighted.get(token) ?? 0) + weight);
      }
    }
    docLengths.set(document.id, length);
    totalLength += length;
    // Each term is independent, so the iteration order of `weighted` cannot
    // change any count. Nothing reads the insertion order of `postings`.
    weighted.forEach((tf, term) => {
      const existing = postings.get(term);
      if (existing) {
        existing.set(document.id, tf);
      } else {
        postings.set(term, new Map([[document.id, tf]]));
      }
      docFreqs.set(term, (docFreqs.get(term) ?? 0) + 1);
    });
  }

  const docCount = documents.length;
  const avgDocLength = docCount > 0 ? totalLength / docCount : 0;
  const k1 = K1;
  const b = B;

  function score(queryTokens: readonly string[], docId: string): number {
    const docLength = docLengths.get(docId);
    if (docLength === undefined || avgDocLength === 0) return 0;
    let total = 0;
    for (const token of uniqueTokens(queryTokens)) {
      const posting = postings.get(token);
      if (!posting) continue;
      const tf = posting.get(docId);
      if (tf === undefined) continue;
      const idf = bm25Idf(docCount, docFreqs.get(token) as number);
      const norm = 1 - b + (b * docLength) / avgDocLength;
      total += (idf * (tf * (k1 + 1))) / (tf + k1 * norm);
    }
    return total;
  }

  return { docCount, avgDocLength, docLengths, postings, docFreqs, k1, b, score };
}
