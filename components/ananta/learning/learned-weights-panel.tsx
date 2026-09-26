"use client";

import { useEffect, useState } from "react";
import { ArrowCounterClockwise, Sliders } from "@phosphor-icons/react/dist/ssr";
import {
  PRIOR_WEIGHTS,
  WEIGHT_IDS,
  overrideWeight,
  resetLearner,
  weightsFor,
  writeLearner,
  type LearnerState,
} from "@/components/ananta/learning";
import { WeightRow, PENALTY_KEYS, type WeightKey } from "@/components/ananta/learning/weight-row";
import { depth, depthShadow } from "@/components/ananta/tokens";
import { todayStamp } from "@/components/ananta/pipeline";

/**
 * "Nothing is learned without being visible and editable."
 *
 * That is a product requirement, and this panel is where it is kept. Every
 * weight in the `Weights` type is on this page, not the top three, because a
 * panel that shows three is a panel that hides nine. Each row carries the
 * current value, the prior, the observation count, and the plausible range from
 * the Beta posterior, so a weight that has never been observed cannot be
 * mistaken for a weight the traveller's choices moved.
 *
 * A slider write goes straight back to the store the objective reads, so an
 * edit changes the next ranking. There is no apply button and no second copy of
 * the truth.
 */

const RANKING_KEYS = WEIGHT_IDS.filter((key) => !PENALTY_KEYS.includes(key));

export function LearnedWeightsPanel({
  learner,
  onChange,
}: {
  learner: LearnerState;
  onChange: (next: LearnerState) => void;
}) {
  const [state, setState] = useState<LearnerState>(learner);
  const [justReset, setJustReset] = useState(false);
  useEffect(() => setState(learner), [learner]);

  const set = (key: WeightKey, value: number) => {
    const now = `${todayStamp()}T00:00:00+05:30`;
    // The bandit is the only stored truth and `weights` is derived from it, so
    // a slider write goes through `overrideWeight` and then re-derives. Writing
    // `weights` directly would create a second truth that the engine never sees,
    // which is the one failure this panel cannot have.
    const bandit = overrideWeight(key, value, now);
    const next: LearnerState = { ...state, bandit, weights: weightsFor(bandit) };
    setJustReset(false);
    setState(next);
    writeLearner(next);
    onChange(next);
  };

  const reset = () => {
    const fresh = resetLearner(`${todayStamp()}T00:00:00+05:30`);
    setState(fresh);
    setJustReset(true);
    onChange(fresh);
  };

  const moved = WEIGHT_IDS.filter((key) => state.weights[key] !== PRIOR_WEIGHTS[key]);
  const untouched = WEIGHT_IDS.length - moved.length;

  return (
    <section
      className={`mt-6 border border-line p-5 ${depth.raised} ${depthShadow.raised}`}
      aria-labelledby="learned-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-blue">
            <Sliders size={15} /> What the system learned about you
          </p>
          <h2 id="learned-heading" className="mt-2 text-xl font-bold tracking-[-0.03em]">
            Your {WEIGHT_IDS.length} weights, editable
          </h2>
          <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted">
            These multipliers decide the ranking. Each one shows the value it started at, how many of your
            own choices moved it, and the range the sampler is still exploring. Moving a slider changes the
            next search immediately.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{state.bandit.observations}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">observations</p>
        </div>
      </div>

      <p className="mt-4 border border-line bg-canvas p-3 text-sm leading-6" role="status" aria-live="polite">
        {state.bandit.observations === 0
          ? "No behaviour has been learned yet. Every weight below is the starting value, and they change only when you save or reject something, or move a slider yourself."
          : `${state.bandit.observations} observation${state.bandit.observations === 1 ? "" : "s"} recorded from your own choices. ${moved.length} weight${moved.length === 1 ? " has" : "s have"} moved off the starting value and ${untouched} ${untouched === 1 ? "is" : "are"} still there.`}
      </p>

      {state.resetReason ? (
        <p className="mt-3 border border-dashed border-amber bg-amberSoft/30 p-3 text-sm leading-6 text-amber">
          {state.resetReason} Nothing you did was wrong, and nothing was deleted: the panel is showing the
          starting values because the stored copy could not be read.
        </p>
      ) : null}

      <h3 className="mt-6 text-sm font-bold uppercase tracking-[0.1em] text-muted">
        Ranking components ({RANKING_KEYS.length})
      </h3>
      <ul className="mt-3 space-y-4">
        {RANKING_KEYS.map((key) => (
          <WeightRow key={key} weightKey={key} state={state} onChange={set} />
        ))}
      </ul>

      <h3 className="mt-6 text-sm font-bold uppercase tracking-[0.1em] text-muted">
        Penalties ({PENALTY_KEYS.length})
      </h3>
      <p className="mt-1 text-xs leading-5 text-muted">
        These two subtract rather than add, so a higher number makes the plan more conservative.
      </p>
      <ul className="mt-3 space-y-4">
        {PENALTY_KEYS.map((key) => (
          <WeightRow key={key} weightKey={key} state={state} onChange={set} />
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-[44px] items-center gap-2 border border-line px-4 py-2 text-sm font-bold"
        >
          <ArrowCounterClockwise size={16} /> Reset to the prior
        </button>
        <p className="text-xs leading-5 text-muted">
          {justReset
            ? "Reset. Every weight is back at its starting value and the observation count is back to zero."
            : moved.length
              ? `${moved.length} weight${moved.length === 1 ? "" : "s"} moved off the prior. Stored on this device only.`
              : "Nothing has been moved off the prior yet. Stored on this device only."}
        </p>
      </div>
    </section>
  );
}
