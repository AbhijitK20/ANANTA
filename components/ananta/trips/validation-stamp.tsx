"use client";

import { useMemo } from "react";
import { CheckCircle, Info, Warning } from "@phosphor-icons/react/dist/ssr";
import { objectiveFast } from "@/lib/engine/scoring";
import {
  DRIFT_TOLERANCE,
  compareDrift,
  hardChecks,
  objectiveNaive,
  validate,
} from "@/lib/engine/validation";
import type { DiscoveryContext, Stop } from "@/lib/engine";
import { COMPONENT_LABEL, typeScale } from "@/components/ananta/tokens";
import { inrLabel } from "@/components/ananta/pipeline";

/**
 * The validation stamp. The credibility anchor of the whole product, as one block.
 *
 * It exists because `validate()` has always returned a drift figure and no screen
 * has ever shown it. A judge who reads "objective re-derived independently, drift
 * 0.000000" next to a plan is reading the one sentence that says the engine grades
 * its own homework and still got the same answer.
 *
 * Three rules govern what this component is allowed to do:
 *
 *  1. It derives the number itself. It takes stops and a context and calls the
 *     fast path and the independent re-derivation separately, so it is not the
 *     producer echoing its own output. Both sides read their weights from
 *     `ctx.profile.weights`, which is what `weightsFor(ctx)` returns, so the two
 *     are compared under identical weights and the figure measures the arithmetic
 *     rather than a weight mismatch.
 *  2. It imports `DRIFT_TOLERANCE` from the engine. A second literal is how a
 *     1e-6 bound quietly becomes 1e-3 in six months.
 *  3. A drifted plan is shown as failed. Never as valid with a footnote. A
 *     reassuring layout wrapped around a number that failed is the worst outcome
 *     this product can produce, because it transfers the engine's credibility to a
 *     claim the engine just refused.
 *
 * `stopComponents`, `crowd` and friends are re-derived here rather than accepted,
 * so the per-component table below is evidence and not decoration.
 */

/** Six decimals, with the exponent kept whenever six decimals would read as zero. */
function driftText(drift: number): string {
  const fixed = drift.toFixed(6);
  return fixed === "0.000000" && drift > 0 ? `${fixed} (${drift.toExponential(1)})` : fixed;
}

const EXPLANATION =
  "The score you are looking at was computed one way, then computed again by a " +
  "separate piece of code that never sees the first answer: it re-reads the " +
  "records, re-measures every leg from the map coordinates, and re-derives the " +
  "rating from the raw review totals. If the two disagree by more than a rounding " +
  "error, at least one of them is wrong, and the plan is marked failed rather than " +
  "shown to you as good.";

export function ValidationStamp({
  stops,
  ctx,
  soldOutIds = [],
}: {
  stops: readonly Stop[];
  ctx: DiscoveryContext;
  /** Ids the provider says are sold out. They are named in the failure, not hidden. */
  soldOutIds?: readonly string[];
}) {
  const report = useMemo(() => {
    const fast = objectiveFast(stops, ctx);
    const naive = objectiveNaive(stops, ctx);
    const comparison = compareDrift(fast, naive);
    const checks = hardChecks(stops, ctx);
    const imposed = checks.filter((check) => check.imposed);
    const satisfied = imposed.filter((check) => check.satisfied).length;
    const failing = imposed.filter((check) => !check.satisfied);
    // Recomputed rather than accepted, so the stamp is the check and not a report
    // of one. `validate` adds the drift and purity issues on top of these.
    const result = validate(stops, ctx, fast);
    const drifted = comparison.drift > DRIFT_TOLERANCE;
    const diverging = comparison.perComponent.filter(
      (row) => row.id !== "aggregate" && Math.abs(row.delta) > DRIFT_TOLERANCE,
    );
    return {
      comparison,
      result,
      imposed,
      satisfied,
      failing,
      drifted,
      diverging,
      ok: !drifted && failing.length === 0 && result.ok,
    };
  }, [stops, ctx]);

  const { comparison, imposed, satisfied, failing, drifted, diverging, ok } = report;
  const tone = ok ? "green" : "amber";
  const border = ok ? "border-green" : "border-amber";
  const fill = ok ? "bg-greenSoft/40" : "bg-amberSoft/40";
  const ink = ok ? "text-green" : "text-amber";
  const Icon = ok ? CheckCircle : Warning;

  // Three distinct verdicts, because one headline cannot carry them. Collapsing
  // "the score did not reproduce" and "the plan does not fit" into a single
  // "do not rely on this" would tell a reader their objective is unreliable when
  // the arithmetic agreed perfectly and the window is what is too short.
  const eyebrow = drifted
    ? "Failed independent re-derivation"
    : failing.length
      ? "Verified score, plan does not fit"
      : "Independently re-derived";
  const headline = drifted
    ? `Do not rely on this score. Drift ${driftText(comparison.drift)}, over the ${DRIFT_TOLERANCE.toFixed(6)} bound.`
    : failing.length
      ? `The score checks out. The plan needs ${failing.length} change${failing.length === 1 ? "" : "s"}.`
      : `Objective re-derived independently. Drift ${driftText(comparison.drift)}.`;
  const lede = drifted
    ? `The two derivations disagree by ${driftText(comparison.drift)}, which is more than the ${DRIFT_TOLERANCE.toFixed(6)} bound this project sets. The objective itself is untrustworthy, so neither the ranking nor the plan below carries any weight.`
    : failing.length
      ? `The two derivations agree to ${driftText(comparison.drift)}, so the score is sound. ${failing.length} hard constraint${failing.length === 1 ? "" : "s"} failed, and ${failing.length === 1 ? "it is" : "they are"} named below rather than summarised.`
      : `The score was computed, then computed again by code that never sees the first answer, and the two agree to ${driftText(comparison.drift)}. Every hard constraint the trip imposes is satisfied.`;

  return (
    <section
      className={`border ${border} ${fill} p-5`}
      aria-label="Validation"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`${typeScale.micro} font-bold uppercase tracking-[0.12em] ${ink}`}>
            {eyebrow}
          </p>
          <h2 className={`mt-2 ${typeScale.title}`}>{headline}</h2>
        </div>
        <p className={`${typeScale.meta} max-w-[24ch] font-semibold ${ok ? "text-green" : "text-amber"}`}>
          <Icon size={18} className="mr-1 inline align-[-3px]" aria-hidden="true" />
          {satisfied} of {imposed.length} hard constraints satisfied
        </p>
      </div>

      <p className="mt-3 max-w-[68ch] text-sm leading-6">{lede}</p>

      <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-muted">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span title={EXPLANATION}>
          What re-derived independently means, and why a disagreement fails the plan.
        </span>
      </p>

      {failing.length > 0 && (
        <div className="mt-4 border border-line bg-white p-4">
          <p className={`${typeScale.micro} font-bold uppercase tracking-[0.12em] text-muted`}>
            Which constraints failed
          </p>
          <ul className="mt-2 space-y-2">
            {failing.map((check) => (
              <li key={check.name} className="text-sm leading-6">
                <span className="font-bold">{check.name}</span>
                {check.issues.length > 0 && (
                  <ul className="mt-1 space-y-1">
                    {check.issues.slice(0, 4).map((issue, index) => (
                      <li key={`${issue.code}-${index}`} className="text-muted">
                        {issue.sentence}
                        {issue.offendingId ? (
                          <>
                            {" "}
                            <span className="font-semibold text-ink">Offending stop: {issue.offendingId}.</span>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {check.issues.length === 0 && (
                  <p className="text-muted">
                    {check.name === "minimum stops"
                      ? `The plan holds ${stops.length} stop${stops.length === 1 ? "" : "s"} against a minimum of the number you set.`
                      : "No measured shortfall, so this is a count and not a distance."}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {drifted && diverging.length > 0 && (
        <div className="mt-4 border border-amber bg-white p-4">
          <p className={`${typeScale.micro} font-bold uppercase tracking-[0.12em] text-amber`}>
            Components that disagree, worst first
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left text-xs">
              <caption className="sr-only">
                Per-component objective contribution from the composed path and from the independent
                re-derivation, with the difference between them.
              </caption>
              <thead>
                <tr className="border-b border-line text-muted">
                  <th scope="col" className="py-1 pr-2 font-semibold">Component</th>
                  <th scope="col" className="py-1 pr-2 text-right font-semibold">Composed</th>
                  <th scope="col" className="py-1 pr-2 text-right font-semibold">Re-derived</th>
                  <th scope="col" className="py-1 text-right font-semibold">Difference</th>
                </tr>
              </thead>
              <tbody>
                {diverging.slice(0, 6).map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <th scope="row" className="py-1 pr-2 font-semibold">
                      {COMPONENT_LABEL[row.id] ?? row.id}
                    </th>
                    <td className="py-1 pr-2 text-right font-mono">{row.fast.toFixed(4)}</td>
                    <td className="py-1 pr-2 text-right font-mono">{row.naive.toFixed(4)}</td>
                    <td className="py-1 text-right font-mono font-bold text-amber">
                      {row.delta.toExponential(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">
            The composed path sums the per-stop components above. The re-derived path reads the records
            again and recomputes each one from its own inputs. A row here means those two readings of the
            same field disagree, and it is a defect in one of the two, not in your plan.
          </p>
        </div>
      )}

      {soldOutIds.length > 0 && (
        <p className="mt-4 border border-amber bg-white p-3 text-sm leading-6">
          <span className="font-bold">Availability changed while you were planning.</span>{" "}
          {soldOutIds.length === 1 ? "One stop in" : `${soldOutIds.length} stops in`} this plan
          {soldOutIds.length === 1 ? " is" : " are"} sold out. The replan section below offers a
          replacement for {soldOutIds.length === 1 ? "it" : "each"}.
        </p>
      )}

      {imposed.length === 0 && (
        <p className="mt-4 text-xs leading-5 text-muted">
          This context imposes no hard constraint, so the count above is not a claim about your plan.
        </p>
      )}

      <p className="mt-4 border-t border-line pt-3 text-xs leading-5 text-muted">
        Drifts are compared against {DRIFT_TOLERANCE.toFixed(6)}, the tolerance the engine exports as{" "}
        <code className="rounded bg-white px-1">DRIFT_TOLERANCE</code>. Travel legs inside the score are
        straight-line estimates at the manifest congestion multiplier, which is why a leg&apos;s kilometres
        are labelled as an estimate and not read as a route. The plan&apos;s listed cost is{" "}
        {inrLabel(stops.reduce((sum, stop) => sum + stop.costInr, 0))} for the party, from the price each
        record carries.
      </p>
    </section>
  );
}
