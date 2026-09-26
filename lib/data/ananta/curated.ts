import type { CuratedFacts } from "@/lib/data/curated/types";
import { southFacts } from "@/lib/data/curated/south";
import { westFacts } from "@/lib/data/curated/west";
import { naviFacts } from "@/lib/data/curated/navi";

/**
 * The hand-authored Experience layer, in one lookup.
 *
 * Only records listed here carry facts a person wrote and checked. Everything
 * else in `anantaRecords` is an estimate, and `enrich` marks it as one. That
 * distinction is the whole point, so it is a set membership test rather than a
 * confidence score: if an id is not in here, nothing on it was verified.
 */
export const curatedFacts: readonly CuratedFacts[] = [...southFacts, ...westFacts, ...naviFacts];

export const curatedById: ReadonlyMap<string, CuratedFacts> = new Map(
  curatedFacts.map((facts) => [facts.id, facts]),
);

/** The ids that carry real, hand-authored Experience-layer facts. */
export const curatedRecordIds: ReadonlySet<string> = new Set(curatedById.keys());

/** Duplicate ids would silently overwrite each other, so this is a test failure. */
export function duplicateCuratedIds(): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const facts of curatedFacts) {
    if (seen.has(facts.id)) dupes.add(facts.id);
    seen.add(facts.id);
  }
  return Array.from(dupes).sort();
}

export type { CuratedFacts };
