"use client";

import { useEffect, useState } from "react";
import { ArrowCounterClockwise, Sliders } from "@phosphor-icons/react/dist/ssr";
import {
  PRIOR_WEIGHTS,
  WEIGHT_BOUNDS,
  WEIGHT_IDS,
  WEIGHT_MEANING,
  clampWeight,
  isNewChoice,
  readLearner,
  resetLearner,
  writeLearner,
  type LearnerState,
} from "@/components/ananta/learning";
import { todayStamp } from "@/components/ananta/pipeline";

/**
 * "What I learned about you", editable.
 *
 * The old profile page said no behavioural profile is built, which was true and
 * which stopped being true the moment the bandit started sampling weights. The
 * honest version of that line is here: the panel shows every weight, its prior,
 * its current value, and how many observations moved it, and every slider writes
 * straight back to the same store the objective reads.
 *
 * Nothing is learned without being visible here. An observation is only counted
 * from a named interaction: a weight the traveller moved, or a place they chose
 * to add to the plan. There is no passive tracking.
 */

export function LearnedWeights({
  learner,
  onChange,
}: {
  learner: LearnerState;
  onChange: (next: LearnerState) => void;
}) {
  const [state, setState] = useState<LearnerState>(learner);
  useEffect(() => setState(learner), [learner]);

  const set = (key: (typeof WEIGHT_IDS)[number], value: number) => {
    const now = `${todayStamp()}T00:00:00+05:30`;
    const next: LearnerState = {
      ...state,
      weights: { ...state.weights, [key]: clampWeight(key, value) },
      // Moving a slider is itself an observation, and a stated preference is
      // the strongest signal available, so the arm is bumped rather than
      // quietly nudged.
      bandit: {
        ...state.bandit,
        observations: state.bandit.observations + 1,
        updatedAt: now,
        arms: state.bandit.arms.map((arm) =>
          arm.component === key
            ? { ...arm, alpha: arm.alpha + 1, pulls: arm.pulls + 1 }
            : arm,
        ),
      },
    };
    setState(next);
    writeLearner(next);
    onChange(next);
  };

  const reset = () => {
    const fresh = resetLearner(`${todayStamp()}T00:00:00+05:30`);
    setState(fresh);
    onChange(fresh);
  };

  const changed = WEIGHT_IDS.filter((key) => state.weights[key] !== PRIOR_WEIGHTS[key]);

  return (
    <section className="mt-6 border border-line p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-blue">
            <Sliders size={15} /> What the system learned about you
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-[-0.03em]">Your weights, editable</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-muted">
            These multipliers decide the ranking. Every one is shown with the value it started at and the
            number of observations behind it, and moving a slider changes the next search immediately.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{state.bandit.observations}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">observations</p>
        </div>
      </div>

      <ul className="mt-5 space-y-4">
        {WEIGHT_IDS.map((key) => {
          const value = state.weights[key];
          const prior = PRIOR_WEIGHTS[key];
          const arm = state.bandit.arms.find((item) => item.component === key);
          const bounds = WEIGHT_BOUNDS[key];
          const moved = value !== prior;
          return (
            <li key={key}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <label htmlFor={`weight-${key}`} className="text-sm font-bold">
                  {key === "travelPenalty" ? "Travel penalty" : key === "pacePenalty" ? "Pace penalty" : key}
                </label>
                <p className="flex items-center gap-2 text-xs font-semibold text-muted">
                  <span className={moved ? "text-blue" : ""}>now {value}</span>
                  <span>prior {prior}</span>
                  <span>{(arm?.pulls ?? 0)} obs</span>
                </p>
              </div>
              <input
                id={`weight-${key}`}
                type="range"
                min={bounds.min}
                max={bounds.max}
                step={bounds.step}
                value={value}
                onChange={(event) => set(key, Number(event.target.value))}
                className="mt-2 w-full accent-[#175CD3]"
              />
              <p className="mt-1 text-xs leading-5 text-muted">{WEIGHT_MEANING[key]}</p>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-bold"
        >
          <ArrowCounterClockwise size={16} /> Reset to the prior
        </button>
        <p className="text-xs leading-5 text-muted">
          {changed.length
            ? `${changed.length} weight${changed.length === 1 ? "" : "s"} moved off the prior. Stored on this device only.`
            : "Nothing has been moved off the prior yet. Stored on this device only."}
        </p>
      </div>
    </section>
  );
}

/** The read-only summary the explore and trips pages show in one line. */
export function LearnerSummary({ learner }: { learner: LearnerState }) {
  const moved = WEIGHT_IDS.filter((key) => learner.weights[key] !== PRIOR_WEIGHTS[key]);
  const top = moved
    .map((key) => ({ key, delta: learner.weights[key] - PRIOR_WEIGHTS[key] }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);
  return (
    <p className="text-xs leading-5 text-muted">
      {learner.bandit.observations} observation{learner.bandit.observations === 1 ? "" : "s"} so far.{" "}
      {top.length
        ? `Biggest move off the prior: ${top.map((item) => `${item.key} ${item.delta > 0 ? "+" : ""}${item.delta}`).join(", ")}.`
        : "Nothing has moved off the prior yet."}{" "}
      <a href="/profile#learned" className="font-bold text-blue">
        Edit the weights
      </a>
    </p>
  );
}

export { isNewChoice };
