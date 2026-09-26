"use client";

import type { Weights } from "@/lib/engine";
import { COMPONENT_LABEL, CONFIDENCE_TONE, depth, depthShadow } from "@/components/ananta/tokens";
import { WEIGHT_BOUNDS, WEIGHT_MEANING, PRIOR_WEIGHTS, type LearnerState } from "@/components/ananta/learning";
import {
  IDENTIFICATION_COPY,
  identification,
  roundWeight,
  weightRange,
} from "@/components/ananta/learning/beta-range";

/**
 * One weight, shown, editable, and honest about which of the three it is:
 * a starting value, a value being guessed at, or a value the traveller's own
 * choices moved.
 *
 * A slider on its own cannot tell you any of that. So the row carries three
 * separate readings, and none of them is colour:
 *
 *   - the current value, which is what the ranking uses right now
 *   - the plausible range, which is the Beta posterior mapped onto the weight's
 *     own bounds, and which is what makes this a posterior rather than a number
 *   - the prior and the observation count, so "unchanged" and "unchanged because
 *     you never touched it" are different sentences
 *
 * Two controls, one value. A slider is good at coarse movement and bad at
 * landing on a number, so there is a number field beside it, and both write
 * through the same `onChange`, which is the only path to the store. There is no
 * apply button and no second copy of the truth.
 *
 * The track sits in a recessed well because a bare range input on a white page
 * has no edge to grip and reads as a stray line. The thumb, the fill and the
 * focus ring stay native: the blue `accent` is the one cross-browser lever, and
 * hand-rolling `::-webkit-slider-thumb` would style Chrome and leave Firefox on
 * something else.
 */

export type WeightKey = keyof Weights;

/** The two penalties are not ranking components, so they get their own heading. */
export const PENALTY_KEYS: readonly WeightKey[] = ["travelPenalty", "pacePenalty"];

export function weightLabel(key: WeightKey): string {
  if (key === "travelPenalty") return "Travel penalty";
  if (key === "pacePenalty") return "Pace penalty";
  return COMPONENT_LABEL[key] ?? key;
}

/**
 * Snap a typed number onto the weight's own step grid, inside its own bounds.
 *
 * A number field lets someone type 0.37 into a weight whose step is 0.25, and
 * without this the stored value would sit between two reachable values, so the
 * slider and the number would disagree the moment either was touched.
 */
function snapToStep(raw: number, bounds: { min: number; max: number; step: number }, fallback: number) {
  if (!Number.isFinite(raw)) return fallback;
  const clamped = Math.min(bounds.max, Math.max(bounds.min, raw));
  const steps = Math.round((clamped - bounds.min) / bounds.step);
  return Number((bounds.min + steps * bounds.step).toFixed(4));
}

export function WeightRow({
  weightKey,
  state,
  onChange,
}: {
  weightKey: WeightKey;
  state: LearnerState;
  onChange: (key: WeightKey, value: number) => void;
}) {
  const bounds = WEIGHT_BOUNDS[weightKey];
  const value = state.weights[weightKey];
  const prior = PRIOR_WEIGHTS[weightKey];
  const arm = state.bandit.arms.find((item) => item.component === weightKey);
  const pulls = arm?.pulls ?? 0;
  const alpha = arm?.alpha ?? 1;
  const beta = arm?.beta ?? 1;
  const range = weightRange(alpha, beta, bounds);
  const moved = value !== prior;
  const state_ = identification(pulls);
  const decimals = bounds.step >= 1 ? 0 : bounds.step >= 0.1 ? 2 : 3;
  const rangeId = `weight-${weightKey}`;
  const valueId = `weight-${weightKey}-value`;

  // Depth encodes epistemic status and never a number. There are two independent
  // things to say here, so there are three states, and the middle one is the
  // interesting one:
  //   - a row the traveller moved off the prior, with enough pulls to stand behind
  //     it, is `depth-raised`: this is what the bandit actually learned
  //   - a row still sitting on the prior, or moved with too few observations to be
  //     identifiable, is `depth-flush`: our starting arithmetic, or a guess
  //   - a row is never raised above flush, because the top step means "act on this"
  //     and no individual weight is a call to action
  // An `estimate`-confidence component therefore cannot masquerade as learned: too
  // few pulls and it stays flush no matter what the point value says.
  const identifiable = pulls >= 4;
  const rowDepth = moved && identifiable ? depth.raised : depth.flush;
  const rowShadow = moved && identifiable ? depthShadow.raised : depthShadow.flush;

  return (
    <li className={`rounded border border-line p-4 ${rowDepth} ${rowShadow}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <label htmlFor={rangeId} className="text-sm font-bold text-ink">
          {weightLabel(weightKey)}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted">now</span>
          <input
            id={valueId}
            type="number"
            inputMode="decimal"
            min={bounds.min}
            max={bounds.max}
            step={bounds.step}
            value={Number(value.toFixed(decimals))}
            onChange={(event) => onChange(weightKey, snapToStep(Number(event.target.value), bounds, value))}
            aria-label={`${weightLabel(weightKey)}, current value`}
            className="w-24 rounded border border-line bg-canvas px-2 py-1.5 text-right text-sm font-bold tabular-nums text-ink"
          />
        </div>
      </div>

      <div className="mt-3 rounded border border-line bg-canvas px-3 py-1 shadow-recessed">
        <input
          id={rangeId}
          type="range"
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          value={value}
          onChange={(event) => onChange(weightKey, Number(event.target.value))}
          aria-describedby={`${rangeId}-range ${rangeId}-state`}
          className="w-full accent-[#175CD3]"
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-muted">
        <span className="tabular-nums">{bounds.min}</span>
        <span className="tabular-nums">prior {prior.toFixed(decimals)}</span>
        <span className="tabular-nums">{bounds.max}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`chip ${CONFIDENCE_TONE[state_ === "unobserved" ? "unverified" : state_ === "usable" ? "community" : "estimate"]}`}
        >
          {state_ === "unobserved" ? "prior" : state_ === "barely" ? "barely observed" : state_ === "weak" ? "weakly observed" : "observed"}
        </span>
        <span id={`${rangeId}-state`} className="text-xs leading-5 text-muted">
          {IDENTIFICATION_COPY[state_]}
        </span>
      </div>

      <p id={`${rangeId}-range`} className="mt-2 text-xs leading-5 text-muted">
        Plausible range {roundWeight(range.low, bounds.step)} to {roundWeight(range.high, bounds.step)}, from{" "}
        {Math.round(range.coverage * 100)}% of the Beta posterior behind this arm.{" "}
        {moved
          ? "You moved this one, so the difference from the prior is your choice, not ours."
          : "Still on the prior, so the range describes what the sampler could try rather than what it learned."}
      </p>

      <p className="mt-1 text-xs leading-5 text-muted">{WEIGHT_MEANING[weightKey]}</p>
    </li>
  );
}

/**
 * A compact read-only range, for the places that show a weight without letting
 * the traveller change it. Same arithmetic, no slider, no buttons.
 */
export function WeightRangeReadout({ weightKey, state }: { weightKey: WeightKey; state: LearnerState }) {
  const bounds = WEIGHT_BOUNDS[weightKey];
  const arm = state.bandit.arms.find((item) => item.component === weightKey);
  const pulls = arm?.pulls ?? 0;
  const range = weightRange(arm?.alpha ?? 1, arm?.beta ?? 1, bounds);
  return (
    <span className="text-xs font-semibold text-muted">
      {roundWeight(state.weights[weightKey], bounds.step)}
      <span aria-hidden="true"> · </span>
      <span className="sr-only">plausible range </span>
      {roundWeight(range.low, bounds.step)} to {roundWeight(range.high, bounds.step)}
      <span aria-hidden="true"> · </span>
      {pulls} obs
    </span>
  );
}
