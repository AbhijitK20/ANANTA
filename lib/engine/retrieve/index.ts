/**
 * Stage 1 public surface: candidate retrieval.
 *
 * This is the only place another stage or the UI may import from. The
 * repository barrel `lib/engine/index.ts` re-exports this file, and no other
 * session may edit either.
 *
 * `fixtures` is deliberately not re-exported: it holds test records, and test
 * records must not be reachable from the product.
 */

export * from "./tokenize";
export * from "./bm25";
export * from "./facets";
export * from "./index-builder";
export * from "./isochrone";
export * from "./retrieve";
