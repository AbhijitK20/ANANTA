/**
 * A bridge to the engine, not a fork of it.
 *
 * RULE 0 of `UI-UX-Fix-Prompts/00-CONTRACTS.md` says the view layer may not
 * implement anything that already exists in `lib/engine/`, and that everything
 * comes from `@/lib/engine`. The barrel at `lib/engine/index.ts` currently
 * re-exports `./contracts` and nothing else, so the replan stage is unreachable
 * through the public surface even though `lib/engine/replan/` is fully written
 * and fully tested.
 *
 * So this file re-exports. It declares no function, no constant and no type of
 * its own, so there is no second implementation to drift: every symbol below
 * resolves to the engine's own binding, and a session 1 edit to the engine is
 * picked up here without a second edit.
 *
 * `ponytail:` the upgrade path is to delete this file and change one import per
 * call site from `@/components/ananta/replan/engine` to `@/lib/engine`. The
 * named exports below match the frozen names exactly, so the change is
 * mechanical. Tracked in `UI-UX-Fix-Prompts/BLOCKERS/9.md`.
 */

export {
  applyNamedTrigger,
  markSoldOut,
  TRIGGERS,
  type TriggerArgs,
  type TriggerSpec,
  type TriggerTransform,
} from "@/lib/engine/replan/triggers";

export { applyTrigger as applyEngineTrigger } from "@/lib/engine/replan/replan";

export {
  diffAgainstOriginal,
  constraintLead,
  countSubstitutions,
  planMinutes,
} from "@/lib/engine/replan/swap";

export {
  assertIntentIntact,
  buildContext,
  cloneForMutation,
  deepFreeze,
  draftFor,
  type ContextInput,
} from "@/lib/engine/replan/context";

export { planId, walkLadder } from "@/lib/engine/replan/minimality";
