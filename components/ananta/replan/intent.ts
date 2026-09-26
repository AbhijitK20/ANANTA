import type { DiscoveryContext, Plan, Rejection, RejectionCode, RejectionUnit, Stop, Swap } from "@/lib/engine";
import { rejectionSentence } from "@/lib/engine";
import { countSubstitutions, planMinutes } from "@/components/ananta/replan/engine";

/**
 * Intent preservation.
 *
 * The masterplan's principle 3 is never replace the traveller's intent, and the
 * failure it names is not the swap. It is the silent substitution: the traveller
 * asked for local and cultural, the packer returned a shopping mall, and nothing
 * on screen told them their goal had quietly changed. So the proposal names the
 * intent back to them, from `ctx.original`, which is the frozen baseline no
 * trigger can reach.
 *
 * Two hard rules this file exists to hold:
 *
 * 1. Intent is read from `ctx.original`, never from the mutated context. A
 *    trigger that changed the weather did not change what the traveller wanted.
 * 2. Nothing here decides anything. It reads, compares, and reports. Every
 *    consequence of a change belongs to the engine.
 */

export type IntentFacet = { label: string; value: string };

export type PreservedIntent = {
  /** One line, in the masterplan's own shape. Never empty. */
  headline: string;
  facets: IntentFacet[];
  /** True when the traveller never named an interest at all. */
  unnamedInterest: boolean;
};

const rupees = (value: number): string => `\u20b9${Math.round(value).toLocaleString("en-IN")}`;

const clock = (iso: string): string => {
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return iso;
  const hour = Number(match[1]);
  const suffix = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${match[2]} ${suffix}`;
};

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The intent, read from the frozen baseline. Every facet names the field it came
 * from, so the panel can be audited against the context.
 */
export function preservedIntent(ctx: DiscoveryContext): PreservedIntent {
  const original = ctx.original;
  const interests = Object.keys(original.profile.interests).filter(
    (key) => (original.profile.interests[key] ?? 0) > 0,
  );
  const query = original.query.trim();
  const named = interests.length > 0 ? interests : query ? [query] : [];
  const facets: IntentFacet[] = [];

  if (named.length) {
    facets.push({ label: "Asked for", value: named.join(", ") });
  }
  if (original.profile.avoid && Object.keys(original.profile.avoid).length) {
    facets.push({
      label: "Avoiding",
      value: Object.entries(original.profile.avoid)
        .filter(([, weight]) => weight > 0)
        .map(([key]) => key)
        .join(", "),
    });
  }
  facets.push({
    label: "Window",
    value: `${plural(original.availableMinutes, "minute")} from ${clock(original.now)}${
      original.deadline ? `, back by ${clock(original.deadline)}` : ", no return time set"
    }`,
  });
  facets.push({ label: "Budget", value: `${rupees(original.budgetInr)} for ${plural(original.partySize, "person")}` });
  if (original.hasToddler || original.hasElderly || original.accessNeeds.length) {
    const needs = [
      original.hasToddler ? "a toddler" : null,
      original.hasElderly ? "an elderly traveller" : null,
      ...original.accessNeeds.map((need) => need.replace(/_/g, " ")),
    ].filter(Boolean);
    facets.push({ label: "Who is coming", value: needs.join(", ") });
  }
  if (original.diets.length) {
    facets.push({ label: "Diet", value: original.diets.join(", ") });
  }
  facets.push({
    label: "Stop count",
    value: `${original.idealStops} wanted, ${original.pace} pace`,
  });
  if (original.profile.pins.length) {
    facets.push({ label: "Chosen by you", value: plural(original.profile.pins.length, "place") });
  }

  const unnamedInterest = named.length === 0;
  return {
    headline: unnamedInterest
      ? "You did not name an interest, so the preserved intent is your window, your budget and your party."
      : `Preserving your original goal: ${named.join(" + ").toUpperCase()}`,
    facets,
    unnamedInterest,
  };
}

/**
 * Did a proposal move the traveller away from what they asked for?
 *
 * The check is deliberately narrow: it compares the categories the plan held
 * before with the categories it holds after, and reports any category that was
 * there and is now gone. That is the substitution the masterplan warns about,
 * and it is the one a traveller can act on. It does not judge quality, because
 * quality is the objective's job.
 */
export function intentDrift(before: Plan, after: Plan): {
  lostCategories: string[];
  gainedCategories: string[];
  stopped: number;
  added: number;
  substitutions: number;
} {
  const categoriesOf = (stops: readonly Stop[]): string[] => Array.from(new Set(stops.map((stop) => stop.record.category)));
  const beforeCategories = categoriesOf(before.stops);
  const afterCategories = categoriesOf(after.stops);
  return {
    lostCategories: beforeCategories.filter((category) => !afterCategories.includes(category)),
    gainedCategories: afterCategories.filter((category) => !beforeCategories.includes(category)),
    stopped: before.stops.length,
    added: after.stops.length,
    // The metric the masterplan names: median swaps per context change, 2 or fewer.
    substitutions: countSubstitutions(diffIds(before, after)),
  };
}

function diffIds(before: Plan, after: Plan): Swap[] {
  const beforeIds = before.stops.map((stop) => stop.record.id);
  const afterIds = after.stops.map((stop) => stop.record.id);
  const removed = beforeIds.filter((id) => !afterIds.includes(id));
  const added = afterIds.filter((id) => !beforeIds.includes(id));
  return [...removed, ...added].map((id) => ({
    removedId: beforeIds.includes(id) ? id : null,
    addedId: afterIds.includes(id) ? id : null,
    reason: "",
    scoreDelta: 0,
    minutesDelta: 0,
  }));
}

/** Total plan minutes, through the engine's own sum, in index order. */
export function planTotal(stops: readonly Stop[]): number {
  return planMinutes(stops);
}

/**
 * The `sold_out` state, as a fact with a timestamp.
 *
 * A sold-out slot is information about the world, not a failure of the software,
 * so it never renders as an error. It states what is sold, when the record says
 * it went, and what the provider's own record claims about the rest.
 */
export type AvailabilityState = {
  id: string;
  name: string;
  /** ISO instant from the record. Never a machine clock. */
  soldOutAt: string | null;
  /** Human form of the same instant, or null when nothing is on record. */
  soldOutLabel: string | null;
  bookingUrl: string | null;
  leadTimeMinutes: number;
  isSoldOut: boolean;
  /** The record's own last-checked stamp. */
  updatedAt: string;
};

const dayLabel = (iso: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return iso;
  const suffix = Number(match[4]) < 12 ? "AM" : "PM";
  const hour12 = Number(match[4]) % 12 === 0 ? 12 : Number(match[4]) % 12;
  return `${match[3]}/${match[2]} ${hour12}:${match[5]} ${suffix}`;
};

export function availabilityState(stop: Stop): AvailabilityState {
  const { record } = stop;
  const soldOutAt = record.availability.soldOutAt;
  return {
    id: record.id,
    name: record.name,
    soldOutAt,
    soldOutLabel: soldOutAt ? dayLabel(soldOutAt) : null,
    bookingUrl: record.availability.bookingUrl,
    leadTimeMinutes: record.availability.leadTimeMinutes,
    isSoldOut: Boolean(soldOutAt),
    updatedAt: record.availability.updatedAt,
  };
}

/** Every sold-out stop in a plan. Session 5 reads this for the feasibility meter. */
export function soldOutStops(stops: readonly Stop[]): AvailabilityState[] {
  return stops.map(availabilityState).filter((state) => state.isSoldOut);
}

/**
 * Event rejections, built from the engine's sentence table.
 *
 * RULE 0: the event screen must not hand-write a rejection sentence, so the
 * status maps onto a `RejectionCode` and the sentence comes from
 * `contracts/codes.ts`. The shortfall is the real measured deficit.
 *
 * There is one honest gap and it is a blocker, not a fudge: no code in the frozen
 * table describes an event whose window has closed. That is a fact about time,
 * not a refusal on account of a constraint, so `eventRejection` returns null for
 * it and the screen states the fact with numbers. See BLOCKERS/9.md.
 */
export function eventRejection(input: {
  code: RejectionCode;
  shortfall: number | null;
  unit: RejectionUnit;
  extra?: string;
}): Rejection {
  return {
    code: input.code,
    sentence: rejectionSentence(input.code, {
      shortfall: input.shortfall ?? undefined,
      unit: input.unit,
      extra: input.extra,
    }),
    shortfall: input.shortfall,
    unit: input.unit,
    blocking: true,
    causedBy: "curated",
    causedByConfidence: "community",
  };
}
