import type { CityManifest, DiscoveryContext } from "@/lib/engine/contracts";

/** What the caller hands to `buildContext`. `original` is ours to construct. */
export type ContextInput = Omit<DiscoveryContext, "original">;

/**
 * Recursive freeze. Handles the `original.original` self reference through a
 * `seen` set, so a cyclic context freezes without a stack overflow.
 */
export function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>();
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    const target = node as Record<string, unknown>;
    if (seen.has(target)) return;
    seen.add(target);
    for (const key of Object.keys(target)) walk(target[key]);
    Object.freeze(target);
  };
  walk(value);
  return value;
}

/**
 * Builds the context every replan diffs against.
 *
 * Three separate graphs come out of this: the caller's `input`, the live `ctx`
 * the solvers read, and the frozen `original` the diffs read. They share no
 * object references, so editing a learned weight on the live context cannot
 * reach the baseline, and no downstream mutation can reach the caller's input.
 */
export function buildContext(input: ContextInput, city: CityManifest): DiscoveryContext {
  const live = structuredClone({ ...input, city }) as DiscoveryContext;
  const original = structuredClone(live) as DiscoveryContext;
  original.original = original;
  deepFreeze(original);
  live.original = original;
  return live;
}

/**
 * The one function that makes "diff against original, forever" true by
 * construction rather than by discipline. Every mutation, however many times it
 * is chained, carries the *same* frozen baseline by reference. A patch can
 * never replace it, because `original` is written after the spread.
 */
export function cloneForMutation(
  ctx: DiscoveryContext,
  patch: Partial<DiscoveryContext> = {},
): DiscoveryContext {
  return { ...ctx, ...patch, original: ctx.original };
}

/**
 * Loud failure on the one invariant the whole stage rests on. A trigger that
 * hands back a context with a different baseline has silently turned cumulative
 * displacement into per-step drift, which is the exact defect this stage
 * replaces. Throwing beats repairing it quietly, because a quietly repaired
 * baseline means the traveller is diffed against something nobody chose.
 */
export function assertIntentIntact(ctx: DiscoveryContext, baseline: DiscoveryContext): void {
  if (ctx.original !== baseline) {
    throw new Error("context.original was replaced, so the diff baseline moved");
  }
}

/**
 * A private draft for a trigger transform: deep copy, so an in-place edit to
 * `draft.profile.weights` cannot reach the caller's context, with the frozen
 * baseline reattached so the copy is never mistaken for a new intent.
 */
export function draftFor(ctx: DiscoveryContext): DiscoveryContext {
  const draft = structuredClone(ctx) as DiscoveryContext;
  draft.original = ctx.original;
  return draft;
}
