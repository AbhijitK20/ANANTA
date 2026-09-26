import type { Rejection, RejectionUnit } from "@/lib/engine";
import { REJECTION_UNIT_LABEL } from "@/lib/engine";

/**
 * Number rendering for the explanation layer.
 *
 * Both panels print numbers a traveller is meant to act on, and a panel that
 * rounds one way while the other rounds the other way is the exact failure the
 * explanation layer exists to prevent. Every number in "why this" and "why not
 * that" goes through this file.
 *
 * Two rules, and they are the whole file:
 *
 *  1. Three decimals, always. A raw `0.3333333333333333` in the interface is
 *     arithmetic leaking into the product. A weight, a normalised score and an
 *     objective are all read to the third place, which is more precision than
 *     anyone can act on and far less than floating point offers.
 *  2. A shortfall is a magnitude, never a delta, and never a negative. The
 *     engine's contract says so; this file is where that is enforced for the
 *     view.
 */

/** Three decimals, no sign, no float noise. `0.1 + 0.2` prints as `0.300`. */
export const decimal3 = (value: number): string => {
  if (!Number.isFinite(value)) return "0.000";
  return value.toFixed(3);
};

/** Three decimals with the sign spelled out, so a penalty is not read as a gain. */
export const signed3 = (value: number): string => {
  if (!Number.isFinite(value)) return "0.000";
  if (value > 0) return `+${value.toFixed(3)}`;
  return value.toFixed(3);
};

/**
 * The unit noun, pluralised.
 *
 * `REJECTION_UNIT_LABEL` is singular only, because the engine emits one token
 * per unit and never has to agree with English. The interface does: "1 minute
 * short" and "2 minutes short" cannot come from the same token. `rupees` and
 * `km` are already invariant and are passed through.
 */
const INVARIANT: Partial<Record<RejectionUnit, string>> = { inr: "rupees", km: "km", none: "" };

export const unitNoun = (unit: RejectionUnit, magnitude: number): string => {
  const frozen = INVARIANT[unit];
  if (frozen !== undefined) return frozen;
  const singular = REJECTION_UNIT_LABEL[unit];
  if (!singular) return "";
  return Math.abs(magnitude) === 1 ? singular : `${singular}s`;
};

/** "8 minutes short". Null when the engine reported no magnitude to print. */
export const shortfallText = (item: Rejection): string | null => {
  if (item.shortfall === null || !Number.isFinite(item.shortfall)) return null;
  const magnitude = Math.round(item.shortfall * 10) / 10;
  const noun = unitNoun(item.unit, magnitude);
  if (!noun) return null;
  return `${magnitude.toLocaleString("en-IN")} ${noun} short`;
};

/**
 * The magnitude in a finished sentence, for the "why this" rows.
 *
 * The component sentence that arrives from the engine explains *which* factor
 * spoke. It does not carry how loudly, and the contribution bar that does carry
 * it is `aria-hidden`, because a bar has no text. So the number is written into
 * the paragraph, where a screen reader reaches it and a sighted reader reads
 * the same figure the bar is drawing.
 */
export const contributionText = (contribution: number): string =>
  `Contribution ${signed3(contribution)}.`;
