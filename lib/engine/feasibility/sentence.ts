import { REJECTION_CODES } from "@/lib/engine/contracts";
import type {
  Confidence,
  ExperienceV2,
  Provenance,
  ProvenancedField,
  Rejection,
  RejectionCode,
  RejectionUnit,
} from "@/lib/engine/contracts";

/**
 * The only place a Rejection is constructed, and therefore the only place that
 * decides how blocking it is. Every English word in a rejection comes from
 * `REJECTION_CODES[code].sentence(...)`; this file contributes no prose of its
 * own, only the shape around it.
 */

export interface RejectOptions {
  /** Magnitude of the miss. Always rendered as a positive number. */
  shortfall?: number;
  unit?: RejectionUnit;
  /** A named fact, never a clause. The code table decides how to phrase it. */
  extra?: string;
  /**
   * Overrides the code table's `advisory` flag. Only used where the traveller
   * has declared a fact a hard requirement, which is a per-call property the
   * global code table cannot express.
   */
  blocking?: boolean;
}

export interface RejectCause {
  provenance: Provenance;
  confidence: Confidence;
}

/** Provenance and confidence of the single fact that caused a rejection. */
export function fieldCause(record: ExperienceV2, field: ProvenancedField): RejectCause {
  return {
    provenance: record.provenance[field],
    // A missing confidence entry is session 8's gap. `estimate` is the least
    // wrong stand-in because the value genuinely is being treated as an estimate.
    confidence: record.confidence[field] ?? "estimate",
  };
}

export function reject(code: RejectionCode, opts: RejectOptions, cause: RejectCause): Rejection {
  const spec = REJECTION_CODES[code];
  const shortfall = opts.shortfall === undefined || !Number.isFinite(opts.shortfall) ? null : Math.abs(opts.shortfall);
  const unit: RejectionUnit = shortfall === null ? "none" : (opts.unit ?? "none");
  return {
    code,
    sentence: spec.sentence({ shortfall: shortfall ?? undefined, unit, extra: opts.extra }),
    shortfall,
    unit,
    blocking: opts.blocking ?? !spec.advisory,
    causedBy: cause.provenance,
    causedByConfidence: cause.confidence,
  };
}

/**
 * "We do not know, so we are not claiming it fits." Distinct from a rejection:
 * nothing has been proven false. This is the first-class abstention the gate
 * is allowed to take, and it is what `unverified_required_fact` exists for.
 */
export function abstain(cause: RejectCause, fact: string, blocking = false): Rejection {
  return reject("unverified_required_fact", { extra: fact, blocking }, cause);
}
