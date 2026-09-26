import type {
  DiscoveryContext,
  ExperienceV2,
  Plan,
  Rejection,
  RejectionCode,
  Stop,
  Swap,
} from "@/lib/engine/contracts";
import { rejectionSentence } from "@/lib/engine/contracts";
import { dominantRejection, gate } from "@/lib/engine/feasibility";
import { localMinutesOfDay, objectiveFast } from "@/lib/engine/scoring";

/** At most one decimal, so 2.0 km reads as "2 km" and 2.35 reads as "2.4 km". */
const oneDp = (value: number): string => String(Math.round(value * 10) / 10);

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * The constraint name, lifted straight out of session 1's code table. No stage
 * module gets to hand-write a constraint name, so every reason sentence starts
 * here.
 */
export function constraintLead(code: RejectionCode): string {
  return rejectionSentence(code).replace(/\.\s*$/, "");
}

/** Whole plan time, summed in index order. Float accumulation order matters. */
export function planMinutes(stops: readonly Stop[]): number {
  let total = 0;
  for (const stop of stops) total += stop.travelMinutes + stop.visitMinutes + stop.bufferMinutes;
  return total;
}

const objectiveOf = (stops: readonly Stop[], ctx: DiscoveryContext): number =>
  stops.length ? objectiveFast([...stops], ctx).value : 0;

const ids = (stops: readonly Stop[]): string[] => stops.map((stop) => stop.record.id);

const firstIndexOf = (stops: readonly Stop[], id: string): number =>
  stops.findIndex((stop) => stop.record.id === id);

/**
 * The visit window a stop sat in, taken from the plan rather than from the
 * clock, so a rejection sentence quotes the slot the stop actually occupied and
 * not a window the caller invented after the fact.
 */
const windowAt = (
  stops: readonly Stop[],
  ctx: DiscoveryContext,
  id: string,
): { startMin: number; endMin: number } => {
  const at = firstIndexOf(stops, id);
  if (at >= 0) {
    const found = stops[at];
    return { startMin: found.arriveBy, endMin: found.arriveBy + found.visitMinutes };
  }
  const startMin = localMinutesOfDay(ctx.now);
  return { startMin, endMin: startMin + ctx.availableMinutes };
};

/** The one blocking fact about a record under the context as it stands now. */
const blockingRejection = (
  record: ExperienceV2,
  planStops: readonly Stop[],
  ctx: DiscoveryContext,
): Rejection | null => {
  const result = gate([record], ctx, { windowFor: () => windowAt(planStops, ctx, record.id) });
  const blocking = result.rejected
    .flatMap((entry) => entry.rejections)
    .filter((rejection) => rejection.blocking);
  return dominantRejection(blocking);
};

const kmClause = (
  addedKm: number,
  partner: Stop | null,
): string => {
  if (!partner) return `it sits ${oneDp(addedKm)} km from the previous stop`;
  if (Math.abs(addedKm - partner.travelKm) < 0.05) {
    return `it sits the same ${oneDp(addedKm)} km from the previous stop`;
  }
  return `it sits ${oneDp(addedKm)} km from the previous stop where ${partner.record.name} sat ${oneDp(partner.travelKm)} km`;
};

const timeClause = (addedMinutes: number, partner: Stop | null): string => {
  if (!partner) return "the visit length is set by the new stop";
  const delta = Math.round(addedMinutes - partner.visitMinutes);
  if (delta === 0) return "the visit length is unchanged";
  return delta < 0
    ? `the visit needs ${Math.abs(delta)} min less`
    : `the visit needs ${delta} min more`;
};

const categoryClause = (added: ExperienceV2, partner: ExperienceV2 | null): string => {
  if (!partner) return `it adds ${added.category}`;
  if (partner.category === added.category) return `the focus stays on ${added.category}`;
  return `the focus moves from ${partner.category} to ${added.category}`;
};

const label = (at: number): string => `stop ${at + 1}`;

/** Position `at`, clamped, because a diff can name an id the plan already lost. */
const atOrLast = (stops: readonly Stop[], at: number): Stop =>
  stops[Math.max(0, Math.min(at, stops.length - 1))];

const leadOf = (rejection: Rejection | null | undefined): string =>
  rejection ? `${constraintLead(rejection.code)}. ` : "";

/**
 * One `Swap` per removed id and per added id, with the other side null.
 *
 * `before` supplies which ids moved. Everything the traveller reads, the
 * `reason` and both deltas, is measured against `ctx`: the removed id is gated
 * under the world as it stands now, and the numbers are differences of two
 * plans scored under the same world. `ctx.original` supplies the intent the
 * reason keeps pointing at, and it is never replaced by the caller.
 *
 * `scoreDelta` and `minutesDelta` are the marginal effect of that single id,
 * `objective(after) - objective(after without this change)`, so the removals
 * and the additions sum to the plan level delta instead of each restating it.
 *
 * ponytail: marginal, not Shapley. Two simultaneous removals are each scored
 * alone, so their interaction is approximated. At the demo sizes, median two
 * swaps, the gap is well under a hundredth of an objective point. Upgrade path:
 * average each marginal over a few seeded permutations.
 */
export function diffAgainstOriginal(before: Plan, after: Plan, ctx: DiscoveryContext): Swap[] {
  const beforeIds = ids(before.stops);
  const afterIds = ids(after.stops);
  const removed = beforeIds.filter((id) => !afterIds.includes(id));
  const added = afterIds.filter((id) => !beforeIds.includes(id));

  if (!removed.length && !added.length) return [];

  const afterStops = after.stops;
  const afterValue = objectiveOf(afterStops, ctx);
  const afterMinutes = planMinutes(afterStops);

  // One gate call per before stop, reused by the removals and by the unpaired
  // additions, so the diff does not re-gate the same record three times.
  const blocking = new Map<string, Rejection | null>();
  for (const stop of before.stops) {
    blocking.set(stop.record.id, blockingRejection(stop.record, before.stops, ctx));
  }

  // The lead for an addition that has no removal to pair with: the first stop
  // that survived and is now blocked. That is the constraint a pure addition is
  // repairing, and it is the whole point of the sentence.
  const unpairedLead = (() => {
    const stillPlanned = afterIds.filter((id) => blocking.get(id));
    const first = stillPlanned[0];
    if (first === undefined) return null;
    const rejection = blocking.get(first) ?? null;
    return rejection ? `${constraintLead(rejection.code)} at any stop you already had.` : null;
  })();

  const swaps: Swap[] = [];

  for (const id of removed) {
    const at = Math.max(0, firstIndexOf(before.stops, id));
    const record = before.stops[at].record;
    const withIt = [...afterStops];
    withIt.splice(Math.min(at, withIt.length), 0, atOrLast(before.stops, at));
    const rejection = blocking.get(id) ?? null;
    const minutes = afterMinutes - planMinutes(withIt);
    swaps.push({
      removedId: id,
      addedId: null,
      reason:
        `${leadOf(rejection)}Dropped ${record.name} from ${label(at)}, which frees ${Math.abs(Math.round(minutes))} min. ` +
        (rejection
          ? "That constraint forced it."
          : "Nothing about it is barred, so this is a choice made on plan quality."),
      scoreDelta: round6(afterValue - objectiveOf(withIt, ctx)),
      minutesDelta: Math.round(minutes),
    });
  }

  added.forEach((id, order) => {
    const at = Math.max(0, firstIndexOf(afterStops, id));
    const stop = afterStops[at];
    const withoutIt = afterStops.filter((_, position) => position !== at);
    const partnerId = removed[order];
    const partner =
      partnerId === undefined ? null : before.stops[Math.max(0, firstIndexOf(before.stops, partnerId))];
    const minutes = afterMinutes - planMinutes(withoutIt);
    const detail =
      `${kmClause(stop.travelKm, partner)}, ` +
      `${timeClause(stop.visitMinutes, partner)}, and ` +
      `${categoryClause(stop.record, partner ? partner.record : null)}.`;
    const tail = partner ? "" : unpairedLead ? ` ${unpairedLead}` : " Nothing already planned had to move.";
    swaps.push({
      removedId: null,
      addedId: id,
      reason: partner
        ? `${leadOf(blocking.get(partner.record.id) ?? null)}Swapped ${partner.record.name} for ${stop.record.name} at ${label(at)}. ${detail}`
        : `Added ${stop.record.name} at ${label(at)}. ${detail}${tail}`,
      scoreDelta: round6(afterValue - objectiveOf(withoutIt, ctx)),
      minutesDelta: Math.round(minutes),
    });
  });

  return swaps
    .map((swap, at) => ({ swap, at }))
    .sort(
      (a, b) =>
        Math.abs(b.swap.scoreDelta) - Math.abs(a.swap.scoreDelta) ||
        (a.swap.removedId ?? a.swap.addedId ?? "").localeCompare(
          b.swap.removedId ?? b.swap.addedId ?? "",
        ) ||
        a.at - b.at,
    )
    .map(({ swap }) => swap);
}

/**
 * How many substitutions a `Swap[]` represents. One substitution is one removal
 * and, usually, one matching addition, so the removal count is the number the
 * median swaps per context change metric counts. Session 10 reads this rather
 * than guessing at the shape of the array.
 */
export function countSubstitutions(swaps: readonly Swap[]): number {
  let total = 0;
  for (const swap of swaps) if (swap.removedId !== null) total += 1;
  return total;
}
