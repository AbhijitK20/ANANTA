import { PRIOR_WEIGHTS, WEIGHT_IDS, isNewChoice, type LearnerState } from "@/components/ananta/learning";
import { LearnedWeightsPanel } from "@/components/ananta/learning/learned-weights-panel";
import { WeightRangeReadout, weightLabel, type WeightKey } from "@/components/ananta/learning/weight-row";

/**
 * The one-line summary other screens show, plus the re-exports they already
 * depend on.
 *
 * `app/explore/page.tsx` and `app/trips/page.tsx` both import `LearnerSummary`
 * from this file, and `app/profile/page.tsx` imports `LearnedWeights`. Those
 * call sites belong to sessions 4, 5 and this session, so the names and the
 * signatures stay exactly as they were and the real work lives in
 * `components/ananta/learning/`. Deleting this file means editing three files
 * this session does not own, which is a blocker rather than a tidy-up.
 */
export function LearnedWeights({
  learner,
  onChange,
}: {
  learner: LearnerState;
  onChange: (next: LearnerState) => void;
}) {
  return <LearnedWeightsPanel learner={learner} onChange={onChange} />;
}

/**
 * The read-only line the explore and trips pages show. It names the count, the
 * biggest move off the prior, and where to change it, and when nothing has been
 * learned it says that rather than implying a profile exists.
 */
export function LearnerSummary({ learner }: { learner: LearnerState }) {
  const moved = WEIGHT_IDS.filter((key) => learner.weights[key] !== PRIOR_WEIGHTS[key]);
  const top = moved
    .map((key) => ({ key, delta: learner.weights[key] - PRIOR_WEIGHTS[key] }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);
  return (
    <p className="text-xs leading-5 text-muted">
      {learner.bandit.observations === 0
        ? "No behaviour has been learned yet, so the ranking is running on its starting values."
        : `${learner.bandit.observations} observation${learner.bandit.observations === 1 ? "" : "s"} from your own choices. ` +
          (top.length
            ? `Biggest move off the prior: ${top
                .map((item) => `${weightLabel(item.key as WeightKey)} ${item.delta > 0 ? "+" : ""}${item.delta}`)
                .join(", ")}.`
            : "Nothing has moved off the prior yet.")}{" "}
      <a href="/profile#learned" className="font-bold text-blue">
        See and edit the {WEIGHT_IDS.length} weights
      </a>
    </p>
  );
}

export { isNewChoice, WeightRangeReadout };
