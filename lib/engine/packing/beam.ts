/**
 * Beam search. This is the direct replacement for the `choose()` enumerator in
 * `lib/plan.ts`, which materialised C(60, k) arrays and ran the evaluator on every
 * one of them. Nothing here enumerates a subset. The beam holds `width` partial
 * solutions, each contributes at most `childrenPerNode` new ones per layer, and a
 * node is expanded once and only once, so the number of `score` calls is bounded
 * by `width * iterations * childrenPerNode` no matter how big the pool is.
 *
 * ponytail: the bound is enforced structurally by the `seen` set, not by a budget
 * counter that could be mis-tuned. There is no code path that walks combinations.
 */

export interface BeamOptions<S> {
  /** Seeds. At most `width` are used, in the order given. */
  initial: S[];
  /** Children of one node, in preference order. Truncated to `childrenPerNode`. */
  expand: (node: S, layer: number) => S[];
  /** Maximised. */
  score: (node: S) => number;
  /** Identity for dedup. Defaults to `JSON.stringify`. */
  key?: (node: S) => string;
  width: number;
  iterations: number;
  childrenPerNode: number;
}

export interface BeamResult<S> {
  best: S | null;
  bestScore: number;
  beam: S[];
  layers: number;
  /** `score` calls on expanded children. Hard bound: `width * iterations * k`. */
  childEvals: number;
  /** `score` calls in total, so `childEvals` plus the seeds. */
  scoreCalls: number;
}

export function beamSearch<S>(options: BeamOptions<S>): BeamResult<S> {
  const width = Math.max(1, Math.floor(options.width));
  const iterations = Math.max(0, Math.floor(options.iterations));
  const childrenPerNode = Math.max(1, Math.floor(options.childrenPerNode));
  const keyOf = options.key ?? ((node: S) => JSON.stringify(node));

  const seen = new Set<string>();
  const cached = new Map<string, number>();
  let scoreCalls = 0;
  const scoreNode = (node: S): number => {
    const key = keyOf(node);
    const hit = cached.get(key);
    if (hit !== undefined) return hit;
    scoreCalls += 1;
    const value = options.score(node);
    cached.set(key, value);
    return value;
  };

  type Scored = { node: S; score: number; key: string };
  const byValue = (a: Scored, b: Scored): number => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

  let beam: Scored[] = [];
  for (const node of options.initial.slice(0, width)) {
    const key = keyOf(node);
    if (seen.has(key)) continue;
    seen.add(key);
    beam.push({ node, score: scoreNode(node), key });
  }
  beam.sort(byValue);

  let childEvals = 0;
  let layers = 0;
  for (let layer = 0; layer < iterations; layer += 1) {
    const children: S[] = [];
    for (const parent of beam) {
      let taken = 0;
      for (const child of options.expand(parent.node, layer)) {
        if (taken >= childrenPerNode) break;
        const key = keyOf(child);
        if (seen.has(key)) continue;
        seen.add(key);
        children.push(child);
        taken += 1;
      }
    }
    if (!children.length) break;
    childEvals += children.length;
    layers += 1;
    const scored: Scored[] = children.map((node) => ({ node, score: scoreNode(node), key: keyOf(node) }));
    beam = [...beam, ...scored].sort(byValue).slice(0, width);
  }

  const top = beam[0];
  return { best: top ? top.node : null, bestScore: top ? top.score : 0, beam: beam.map((entry) => entry.node), layers, childEvals, scoreCalls };
}
