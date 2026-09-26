import type {
  DiscoveryContext,
  ExperienceV2,
  Rejection,
  RejectionCode,
  RejectionUnit,
  UnmetDemand,
} from "@/lib/engine/contracts";
import { rejectionSentence } from "@/lib/engine/contracts";

/**
 * The provider side's only data source: what travellers asked for and could not
 * get, grouped so repeats collapse, with the one constraint that killed it named
 * before the distribution behind it.
 *
 * This never re-runs a check, never re-decides a rejection, and never invents
 * one. A rejection the gate did not emit cannot appear here, which is the whole
 * reason session 3's gate emits every rejection rather than a sample.
 *
 * Two data-honesty rules the provider page used to break, both enforced here:
 *
 * 1. `demandCount` is a count. There is no floor under it. A query nobody has
 *    repeated is `demandCount: 1` and says so. The old page called
 *    `Math.max(counts[id], 4)` to trip its own `saves >= 3` alert; that
 *    fabrication is gone and cannot come back through this function.
 * 2. `actionableFor` only names providers whose own facts could plausibly fix
 *    the dominant rejection. A `seasonal_mismatch` is not actionable for anyone;
 *    a `sold_out` is only actionable for the provider who sold out.
 *
 * One grouping implementation, two entry points. `unmetDemandFromStream` is the
 * frozen engine-facing signature and reads a live `GateResult.stream`.
 * `unmetDemandFromRows` reads what `lib/provider.ts` persisted, so the provider
 * page shows the same numbers the engine produced rather than a second opinion.
 */

/**
 * One traveller's rejection of one record, with everything grouping needs
 * already attached. This is the only shape the grouping below understands.
 */
export interface DemandObservation {
  id: string;
  area: string;
  query: string;
  interest: string;
  rejections: Rejection[];
  at: string;
}

const sentenceFor = (code: RejectionCode, shortfall: number | null, unit: RejectionUnit): string =>
  rejectionSentence(code, shortfall === null ? {} : { shortfall, unit });

/**
 * A stable grouping key: the area, plus the interest the traveller named.
 *
 * Two travellers looking for a rainy day out with a toddler in Fort are the same
 * demand. Two travellers in Fort and two in Kharghar are not, because the
 * provider who could serve one cannot serve the other. The query text is
 * deliberately not in the key, so paraphrases of the same wish collapse.
 */
const fingerprintOf = (area: string, interest: string): string => {
  const areaKey = area.trim().toLowerCase().replace(/\s+/g, "-") || "unknown-area";
  const interestKey = interest.trim().toLowerCase().replace(/\s+/g, "-") || "any-interest";
  return `${areaKey}::${interestKey}`;
};

/** The interest that best describes this demand: the traveller's strongest, by name. */
export const dominantInterest = (interests: Record<string, number> | undefined): string => {
  let best = "";
  let bestScore = -Infinity;
  for (const key of Object.keys(interests ?? {}).sort()) {
    const score = (interests ?? {})[key];
    if (typeof score !== "number" || !Number.isFinite(score)) continue;
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
};

/** Median of a numeric array. Even-length inputs average the two middle values. */
export const median = (values: readonly number[]): number | null => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const low = sorted[middle - 1] ?? 0;
  const high = sorted[middle] ?? 0;
  return (low + high) / 2;
};

/**
 * Which providers could act on this. A booking, a price, a capacity, an opening
 * time or an access fact is the provider's own field. Weather, season, distance
 * and the traveller's own state are not facts any provider can change about
 * their own venue, so the list is empty and the feed says so rather than
 * inventing an audience.
 */
const actionableFor = (
  code: RejectionCode,
  area: string,
  records: readonly { id: string; area: string }[],
): string[] => {
  const local = records
    .filter((record) => record.area.trim().toLowerCase() === area.trim().toLowerCase())
    .map((record) => record.id)
    .sort();
  switch (code) {
    case "sold_out":
    case "over_budget":
    case "over_budget_per_person":
    case "capacity_exceeded":
    case "closed_now":
    case "closed_during_window":
    case "hours_unverified":
    case "requires_booking_not_available":
    case "lead_time_too_short":
    case "not_step_free":
    case "not_stroller_ok":
    case "no_accessible_restroom":
    case "requires_steps":
    case "no_seating":
    case "not_quiet_enough":
    case "diet_mismatch":
      return local;
    default:
      return [];
  }
};

/**
 * The one grouping implementation. Every input path funnels here, so the feed a
 * provider reads is the feed the engine produced.
 */
export function unmetDemandFromObservations(
  observations: readonly DemandObservation[],
): UnmetDemand[] {
  const buckets = new Map<
    string,
    { fingerprint: string; area: string; query: string; count: number; ids: Set<string>; first: string; last: string }
  >();

  for (const observation of observations) {
    const blocking = observation.rejections.filter((rejection) => rejection.blocking);
    if (!blocking.length) continue;
    const fingerprint = fingerprintOf(observation.area, observation.interest);
    let bucket = buckets.get(fingerprint);
    if (!bucket) {
      bucket = {
        fingerprint,
        area: observation.area,
        query: observation.query,
        count: 0,
        ids: new Set<string>(),
        first: observation.at,
        last: observation.at,
      };
      buckets.set(fingerprint, bucket);
    }
    bucket.count += 1;
    bucket.ids.add(observation.id);
    if (observation.at < bucket.first) bucket.first = observation.at;
    if (observation.at > bucket.last) bucket.last = observation.at;
    if (!bucket.query && observation.query) bucket.query = observation.query;
  }

  const demands: UnmetDemand[] = [];
  for (const [fingerprint, bucket] of buckets) {
    const rows = observations.filter(
      (observation) => fingerprintOf(observation.area, observation.interest) === fingerprint,
    );
    const blocking = rows.flatMap((row) => row.rejections.filter((rejection) => rejection.blocking));

    // The dominant code is the most frequent blocking one, ties broken by name
    // so the order never depends on Map iteration order.
    const tally = new Map<RejectionCode, number>();
    for (const rejection of blocking) tally.set(rejection.code, (tally.get(rejection.code) ?? 0) + 1);
    const mix = [...tally.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
    const top = mix[0];
    if (!top) continue;

    // Median shortfall is only meaningful in one unit, so it is taken over the
    // shortfalls of the dominant code alone and reported in that code's unit.
    const dominant = blocking.filter((rejection) => rejection.code === top.code);
    const shortfalls = dominant
      .filter((rejection) => rejection.shortfall !== null)
      .map((rejection) => Math.max(0, rejection.shortfall as number));
    const unit = dominant[0]?.unit ?? "none";
    const medianShortfall = median(shortfalls);

    demands.push({
      id: `demand-${fingerprint}`,
      fingerprint,
      area: bucket.area,
      query: bucket.query,
      demandCount: bucket.count,
      dominantRejection: {
        code: top.code,
        sentence: sentenceFor(top.code, medianShortfall, unit),
      },
      rejectionMix: mix,
      medianShortfall,
      unit,
      firstSeenAt: bucket.first,
      lastSeenAt: bucket.last,
      actionableFor: actionableFor(top.code, bucket.area, recordsFor(rows, bucket.ids)),
    });
  }

  // Busiest demand first, then fingerprint, so the report is byte stable.
  demands.sort((a, b) => b.demandCount - a.demandCount || a.fingerprint.localeCompare(b.fingerprint));
  return demands;
}

/**
 * The provider ids an observation set refers to. Only the id and the area are
 * needed, and `actionableFor` filters by area, so the whole catalogue is not
 * threaded through the grouping code. An id that no longer exists in the
 * catalogue simply names nobody, which is the honest outcome for a listing that
 * was later removed.
 */
const recordsFor = (
  rows: readonly DemandObservation[],
  ids: ReadonlySet<string>,
): { id: string; area: string }[] => {
  const seen = new Map<string, { id: string; area: string }>();
  for (const row of rows) {
    if (ids.has(row.id) && !seen.has(row.id)) seen.set(row.id, { id: row.id, area: row.area });
  }
  return [...seen.values()];
};

/**
 * The frozen engine-facing signature. Reads a live `GateResult.stream` under
 * one context.
 */
export function unmetDemandFromStream(
  stream: readonly { id: string; rejections: readonly Rejection[] }[],
  records: readonly ExperienceV2[],
  ctx: DiscoveryContext,
): UnmetDemand[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  const interest = dominantInterest(ctx.profile?.interests);
  return unmetDemandFromObservations(
    stream.map((entry) => ({
      id: entry.id,
      area: byId.get(entry.id)?.area ?? "Unknown area",
      query: ctx.query,
      interest,
      rejections: entry.rejections.slice(),
      at: ctx.now,
    })),
  );
}

/**
 * The persisted-store entry point. Same grouping, so a provider reading the
 * feed sees exactly what the engine measured, not a second calculation that
 * could drift from it.
 */
export function unmetDemandFromRows(
  rows: readonly { id: string; area: string; query: string; interest: string; hits: number; rejections: Rejection[]; lastSeenAt: string }[],
): UnmetDemand[] {
  return unmetDemandFromObservations(
    rows.map((row) => ({
      id: row.id,
      area: row.area,
      query: row.query,
      interest: row.interest,
      rejections: row.rejections.slice(),
      at: row.lastSeenAt,
    })),
  ).map((demand) => {
    const weight = rows
      .filter((row) => `${row.area.trim().toLowerCase()}::${row.interest.trim().toLowerCase()}` === demand.fingerprint)
      .reduce((total, row) => total + row.hits, 0);
    return { ...demand, demandCount: weight || demand.demandCount };
  });
}

/**
 * Actionability, the section 9 criterion: of the demands with a provider who
 * could act on them, how many name one. Reported as a fraction, not a
 * percentage, so a zero-denominator case is visible rather than silently 100%.
 */
export function demandActionability(demands: readonly UnmetDemand[]): {
  actionable: number;
  total: number;
  ratio: number | null;
} {
  const total = demands.length;
  const actionable = demands.filter((demand) => demand.actionableFor.length > 0).length;
  return { actionable, total, ratio: total === 0 ? null : actionable / total };
}
