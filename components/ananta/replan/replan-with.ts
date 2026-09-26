import type { DiscoveryContext, Plan, ReplanResult, TriggerId } from "@/lib/engine";
import { applyEngineTrigger, applyNamedTrigger, type TriggerArgs } from "@/components/ananta/replan/engine";

/**
 * `applyTrigger` at the arity the screens already call.
 *
 * The engine's signature is `applyTrigger(plan, trigger, ctx, mutate, solve)`,
 * with the mutation function injected so the replanner is not responsible for
 * somebody else's import graph. The screens hold a four-argument call, written
 * against the frozen `SESSION/00-CONTRACTS.md` signature, which is the one
 * every other session is coding against. Rather than edit session 5's page, this
 * supplies the `mutate` the engine wants, using the engine's own
 * `applyNamedTrigger`.
 *
 * All the work stays in the engine: the transform, the intent assertion, the
 * ladder walk, the diff and the plan id. This function adds one line of glue and
 * no logic of its own.
 *
 * `ponytail:` upgrade path is for session 5 to pass `applyNamedTrigger` itself
 * and call the engine directly. That is a one-line change at two call sites once
 * `lib/engine/index.ts` exports the stage.
 */
export function replanWith(
  plan: Plan,
  trigger: TriggerId,
  ctx: DiscoveryContext,
  solve: (next: DiscoveryContext) => Plan,
  args: TriggerArgs = {},
): ReplanResult {
  return applyEngineTrigger(plan, trigger, ctx, (draft) => applyNamedTrigger(draft, trigger, args), solve);
}
