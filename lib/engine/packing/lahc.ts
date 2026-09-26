/**
 * Late Acceptance Hill Climbing, the one real anti-local-optima mechanism in the
 * reference set. The whole point is that candidate `i` is judged against the
 * solution from `historyLength` iterations ago, not against the current one, so
 * the search can accept a step downhill on the objective while the reference it
 * is measured against is old.
 *
 * The rng is a seeded LCG. `Math.random()` would make the eval report
 * irreproducible, and an irreproducible report makes session 6's 1e-6 drift
 * comparison noise.
 */

const MODULUS = 2147483647;
const MULTIPLIER = 16807;

/** Park-Miller MINSTD. Exact in a double: 2^31 * 16807 < 2^53. */
export function lcg(seed: number): () => number {
  let state = (Math.floor(seed) % MODULUS + MODULUS) % MODULUS;
  if (state === 0) state = 1;
  return () => {
    state = (state * MULTIPLIER) % MODULUS;
    return (state - 1) / (MODULUS - 1);
  };
}

export interface LahcOptions<S> {
  initial: S;
  sample: (current: S, rng: () => number) => S;
  /** Minimised. Pack passes the negated objective. */
  cost: (candidate: S) => number;
  /** Overrides the default `candidateCost <= referenceCost`. */
  accept?: (candidateCost: number, referenceCost: number) => boolean;
  /**
   * What `best` is tracked on. Defaults to `cost`. Pass the unpenalised objective
   * when `cost` carries adaptive penalties, so the reported best is the best plan
   * and not the least-repeated one.
   */
  fitness?: (candidate: S) => number;
  iterations: number;
  historyLength: number;
  seed?: number;
}

export interface LahcResult<S> {
  best: S;
  bestFitness: number;
  current: S;
  currentCost: number;
  /** The last `historyLength` currents, oldest slot first. */
  history: S[];
  accepted: number;
  /**
   * Accepted moves that made the plan better on the fitness function. Feeds
   * `searchStats.acceptedImprovements`, so it is the honest count of real gains
   * rather than the count of sideways moves the penalty table let through.
   */
  improvements: number;
  /** Cost evaluations, including the one on `initial`. */
  evaluated: number;
}

export function lahc<S>(options: LahcOptions<S>): LahcResult<S> {
  const rng = lcg(options.seed ?? 1);
  const accept = options.accept ?? ((candidateCost: number, referenceCost: number) => candidateCost <= referenceCost);
  const fitness = options.fitness ?? options.cost;
  const length = Math.max(1, Math.floor(options.historyLength));

  let current = options.initial;
  let currentCost = options.cost(current);
  let currentFitness = fitness(current);
  let best = current;
  let bestFitness = currentFitness;
  const history: S[] = new Array(length).fill(current);
  const historyCosts: number[] = new Array(length).fill(currentCost);
  let accepted = 0;
  let improvements = 0;
  let evaluated = 1;

  for (let step = 0; step < options.iterations; step += 1) {
    for (let i = 0; i < length; i += 1) {
      const candidate = options.sample(current, rng);
      const candidateCost = options.cost(candidate);
      evaluated += 1;
      if (!accept(candidateCost, historyCosts[i])) continue;
      // The fitness is only read on a move that was accepted, not on every
      // candidate, so the penalty bookkeeping stays the cheap part of the loop.
      const candidateFitness = fitness(candidate);
      if (candidateFitness < currentFitness) improvements += 1;
      current = candidate;
      currentCost = candidateCost;
      currentFitness = candidateFitness;
      accepted += 1;
    }
    const slot = step % length;
    history[slot] = current;
    historyCosts[slot] = currentCost;
    if (currentFitness < bestFitness) {
      best = current;
      bestFitness = currentFitness;
    }
  }

  return { best, bestFitness, current, currentCost, history, accepted, improvements, evaluated };
}
