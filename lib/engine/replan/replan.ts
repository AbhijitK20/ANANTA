import type {
  DiscoveryContext,
  Plan,
  ReplanResult,
  TriggerId,
} from "@/lib/engine/contracts";
import { objectiveFast } from "@/lib/engine/scoring";
import { assertIntentIntact, draftFor } from "./context";
import { planId, walkLadder } from "./minimality";
import { diffAgainstOriginal } from "./swap";
import { TRIGGERS } from "./triggers";

/**
 * Fires a trigger and returns a *proposal*. Nothing is applied.
 *
 * The masterplan is explicit that normal adaptation is user controlled, so this
 * function's whole job is the cheapest defensible alternative plus the sentences
 * that justify it. Session 9 owns the button that turns a proposal into a stored
 * plan, and the return type says so: a `ReplanResult` carrying the proposed
 * plan, not a mutated one.
 *
 * `mutate` and `solve` are injected so this is testable without the retrieve,
 * gate, packing and validation stages wired together, and so the replanner is
 * not responsible for somebody else's import graph.
 *
 * Order matters and is deliberate: solve against the mutated context, put the
 * answer through the ladder, and only then diff. Diffing first would describe a
 * plan that validation may throw away.
 */
export function applyTrigger(
  plan: Plan,
  trigger: TriggerId,
  ctx: DiscoveryContext,
  mutate: (draft: DiscoveryContext) => DiscoveryContext,
  solve: (ctx: DiscoveryContext) => Plan,
): ReplanResult {
  if (!TRIGGERS[trigger]) throw new Error(`unknown trigger: ${trigger}`);

  // The transform gets a private deep copy, so an in-place edit to
  // `draft.profile.weights` cannot reach the caller's context.
  const next = mutate(draftFor(ctx));
  assertIntentIntact(next, ctx.original);

  const solved = solve(next);
  const walked = walkLadder(solved.stops, next);

  // A fresh object, every time. The input plan is never touched, and the id is
  // recomputed from the content so two runs of the same trigger compare equal.
  const proposal: Plan = {
    id: planId(next, walked.stops),
    stops: walked.stops,
    objective: objectiveFast([...walked.stops], next),
    createdFrom: next,
  };

  return {
    plan: proposal,
    swaps: diffAgainstOriginal(plan, proposal, next),
    rungs: walked.rungs,
    diffedAgainst: "original",
  };
}
