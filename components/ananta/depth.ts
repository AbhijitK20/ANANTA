/**
 * Depth, read from data. Section 2 of `UI-UX-Fix-Prompts/00-CONTRACTS.md` is
 * the design; this file is the part of it that is arithmetic.
 *
 * The contract is blunt about why this file exists: *"Depth encodes what we
 * know, not how big a number is."* Depth may carry epistemic status, hierarchy,
 * sequence, answer quality and system integrity. It may never carry a magnitude.
 * Nothing below reads a price, a rating, a distance or a score. Every function
 * returns a **class name**, never an inline style, because a runtime style
 * bypasses the reduced-motion block in `app/globals.css` entirely and would
 * defeat the guard session 1 ships.
 *
 * The class names themselves are not written here. They come from
 * `@/components/ananta/tokens`, which session 1 owns. A second copy of a depth
 * map is the exact bug RULE 2 exists to prevent, and a drifted one would mean a
 * card and its shadow disagreeing about how far forward it sits.
 *
 * `DRIFT_TOLERANCE` comes from `lib/engine/validation` and is never re-derived
 * here. A second literal would mean the validation stamp and the drift test
 * could disagree about what counts as a failure, and the tilt would be measured
 * against a different threshold than the one the engine fails on.
 */

import type { Confidence, ExperienceV2, ProvenancedField, Rejection, Rung } from "@/lib/engine";
import { DRIFT_TOLERANCE } from "@/lib/engine/validation";
import { KNOWLEDGE_DEPTH, RUNG_DEPTH, depth, depthShadow, driftTilt } from "@/components/ananta/tokens";

/** What a card's depth is reading, and the evidence for it. */
export interface DepthReading {
  record: ExperienceV2;
  confidence: Confidence;
  depthClass: string;
  shadowClass: string;
  /** How many of the record's fields are verified, of how many. */
  verifiedFields: number;
  totalFields: number;
  /** True when the record is partly known. Never collapse this to verified. */
  mixed: boolean;
  /** Present when a gate rejected this record. */
  rejected: boolean;
  rejections: Rejection[];
}

/**
 * The fields a depth reading counts.
 *
 * Every entry is a `ProvenancedField`, so a field the contracts do not model
 * cannot silently join the count and dilute it. The order is fixed so two
 * records with the same coverage produce the same reading.
 */
const COUNTED_FIELDS: readonly ProvenancedField[] = [
  "name", "coordinates", "category", "duration", "price", "capacity",
  "openingHours", "accessibility", "indoor", "kidFriendly", "booking",
  "seasonality", "bestTime", "diet", "rating", "reviewCount",
];

/** Community data is not a guess, so it counts towards coverage like a verified value. */
const TRUSTED: readonly Confidence[] = ["verified", "community"];

function countsVerified(record: ExperienceV2): { verified: number; total: number } {
  let verified = 0;
  let total = 0;
  for (const field of COUNTED_FIELDS) {
    const stated = record.confidence[field];
    if (!stated) continue;
    total += 1;
    if (TRUSTED.includes(stated)) verified += 1;
  }
  return { verified, total };
}

/**
 * The record's own confidence, derived rather than declared.
 *
 * A record is only `verified` when **every** field it states is verified or
 * community. Anything else is `mixed` when it is partly known, and `unverified`
 * when nothing is. `mixed` is the important case: roughly 96 percent of the
 * catalogue is generated, so a record with OSM coordinates and a hash-derived
 * price is the normal case, and collapsing it to `verified` would raise about a
 * thousand cards that the product has no verified claim for.
 */
export function confidenceForRecord(record: ExperienceV2): Confidence {
  const { verified, total } = countsVerified(record);
  if (total > 0 && verified === total) return "verified";
  if (verified > 0) return "community";
  if (total > 0) return "estimate";
  return "unverified";
}

/**
 * Per-record depth, from the record's own fields plus any rejections the gate
 * produced. Rejection wins: encoding 6 says a refused record is recessed
 * whatever its provenance, because "we will not send you here" outranks "we
 * know what time it opens".
 */
export function depthForRecord(record: ExperienceV2, rejections: Rejection[] = []): DepthReading {
  const { verified, total } = countsVerified(record);
  const mixed = total > 0 && verified > 0 && verified < total;
  const rejected = rejections.length > 0;
  const confidence = confidenceForRecord(record);
  // A mixed record is flush, never raised. KNOWLEDGE_DEPTH has no `mixed` key
  // because `mixed` is a view-layer finding, not a contract confidence state,
  // and encoding 1 puts it at `z-flush` beside the estimate.
  const key: Confidence = mixed ? "estimate" : confidence;
  return {
    record,
    confidence,
    depthClass: rejected ? depth.recessed : KNOWLEDGE_DEPTH[key],
    shadowClass: rejected ? depthShadow.recessed : KNOWLEDGE_DEPTH[key] === depth.flush ? depthShadow.flush : depthShadow.raised,
    verifiedFields: verified,
    totalFields: total,
    mixed,
    rejected,
    rejections,
  };
}

/**
 * C-03 the plan recedes into the future. Stop 1 lifted, then one step down per
 * stop across four steps: lifted, raised, flush, recessed.
 *
 * Monotonic and total. A plan of any length is clamped to the four depth steps
 * rather than extrapolated, because the scale has six steps and a ninth stop
 * that sinks further than `recessed` would invent a token nobody wrote. A
 * one-stop plan is `lifted`, because stop 1 is primary however short the plan is.
 */
export function depthForStop(index: number, total: number): string {
  const steps = total <= 1 ? 1 : Math.min(4, total);
  const step = Math.max(0, Math.min(steps - 1, Math.floor(index)));
  return [depth.lifted, depth.raised, depth.flush, depth.recessed][step];
}

/**
 * C-04 plan integrity is tilt. Returns a class name from the seven static rules,
 * so nothing computes a transform at runtime.
 *
 * Zero drift is `tilt-by-drift-0` and is visually flat, because that is the
 * entire point: at perfect agreement the plan does not tilt at all. The
 * tolerance is the engine's, not a number typed here.
 */
export function tiltForDrift(drift: number): string {
  return driftTilt(drift, DRIFT_TOLERANCE);
}

/** C-05 answer quality is height. "We settled for one stop" sits below "exact". */
export function depthForRung(rung: Rung): string {
  return RUNG_DEPTH[rung];
}
