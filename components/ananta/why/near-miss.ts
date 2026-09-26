import type { Rejection, RejectionUnit } from "@/lib/engine";
import { shortfallText } from "./format";

/**
 * Ordering and near-misses for "why not that".
 *
 * A record that failed by 8 minutes and one that failed by 90 are different
 * situations, and a list that ranks them equally has thrown away the only
 * actionable fact it had. So the list is ordered by how far short each rejection
 * fell, smallest first, and the copy says so.
 *
 * **The rule is per unit, and that is the whole subtlety.** 400 rupees and
 * 90 minutes are not two magnitudes, they are two currencies, and sorting them
 * against each other produces a number that means nothing: an ordering that
 * insists 400 rupees is a *bigger* gap than 90 minutes is comparing a rupee to a
 * minute. So shortfalls are only ever compared inside one unit, the unit groups
 * are emitted in a declared order, and the near-miss is the leader of the first
 * group rather than the smallest number in the set.
 *
 * The group order below is a presentation choice, not a difficulty claim. It is
 * the order in which a traveller reaches for the control that sets each one:
 * how long you can stay, what you can spend, how many of you there are, the
 * season, then distance. Nothing here says a minute is easier to fix than a
 * rupee, and no sentence in the panel implies that either.
 */
const UNIT_ORDER: readonly RejectionUnit[] = ["minutes", "inr", "seats", "days", "km", "metres", "none"];

const unitRank = (unit: RejectionUnit): number => {
  const at = UNIT_ORDER.indexOf(unit);
  return at < 0 ? UNIT_ORDER.length : at;
};

const measured = (item: Rejection): boolean => item.shortfall !== null && Number.isFinite(item.shortfall);

/** Shortfall ascending within a unit, unit groups in the declared order. */
export const orderByShortfall = (rejections: readonly Rejection[]): Rejection[] =>
  [...rejections].sort(
    (a, b) =>
      unitRank(a.unit) - unitRank(b.unit) ||
      (measured(a) ? (a.shortfall as number) : Number.POSITIVE_INFINITY) -
        (measured(b) ? (b.shortfall as number) : Number.POSITIVE_INFINITY) ||
      a.code.localeCompare(b.code),
  );

/**
 * The near-miss: the first measured blocking reason in the ordered list.
 *
 * "First measured" rather than "first", because a leading unit group can be
 * entirely unmeasured. Time is the group a traveller would act on first, and if
 * the time reasons carry no magnitude while the budget one does, showing the
 * budget gap is more useful than showing nothing. It still never compares
 * across units: it takes the leading group that has a number in it.
 *
 * Null when no blocking rejection was measured at all, because then there is no
 * near-miss and the panel must not imply one. Advisory rejections are excluded
 * even when they carry a number, since an advisory did not stop anything.
 */
export const nearestMiss = (rejections: readonly Rejection[]): Rejection | null => {
  const ordered = orderByShortfall(rejections.filter((item) => item.blocking));
  return ordered.find(measured) ?? null;
};

/** What each unit belongs to, so the sentence names the limit and not the unit twice. */
const UNIT_LIMIT: Record<RejectionUnit, string> = {
  minutes: "the time limits",
  inr: "the budget",
  seats: "the party size",
  days: "the season",
  km: "the distance",
  metres: "the distance",
  none: "the checks we ran",
};

/**
 * The finished near-miss sentence.
 *
 * Every clause points at a field: the magnitude and unit come from `shortfall`
 * and `unit`, the limit it belongs to is the unit's, and the count comes from the
 * length of the list. It does not promise a specific fix, because which control
 * to open depends on which screen the traveller is standing on, and that is not
 * this component's to know.
 */
export const nearestMissText = (rejections: readonly Rejection[]): string | null => {
  const miss = nearestMiss(rejections);
  if (!miss) return null;
  const magnitude = shortfallText(miss);
  if (!magnitude) return null;

  const others = rejections.filter((item) => item.blocking).length - 1;
  const tail =
    others <= 0
      ? " It is the only thing standing in the way."
      : ` ${others} other blocking reason${others === 1 ? "" : "s"} on this record.`;
  return `Nearest miss: ${magnitude}, the smallest gap in ${UNIT_LIMIT[miss.unit]}.${tail}`;
};
