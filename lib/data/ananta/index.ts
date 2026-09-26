/**
 * Public surface of the ANANTA dataset layer.
 *
 * Session 9 and session 10 import from here rather than reaching into a stage
 * directory, so the v1 records in `@/lib/data` and the graded records in
 * `@/lib/data/ananta/records` can be swapped file by file during the cutover.
 */
export {
  anantaRecords,
  anantaById,
  curatedRecordIds,
  curatedById,
  duplicateCuratedIds,
  enrich,
  fieldSource,
  resolveFieldProvenance,
  PROVENANCE_BY_BASIS,
  PROVENANCED_FIELDS,
} from "@/lib/data/ananta/records";

export type { Basis, CuratedFacts } from "@/lib/data/ananta/records";
