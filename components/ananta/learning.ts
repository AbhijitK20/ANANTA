import type { BanditArm, BanditState, ComponentId, Weights } from "@/lib/engine";
import { COMPONENT_IDS } from "@/lib/engine";

/**
 * The prior and the learning surface.
 *
 * Session 4 owns `scoring/weights.ts` and `scoring/thompson.ts` and exports
 * `PRIOR_WEIGHTS`, `sampleWeights(bandit, rng)`, and
 * `updateBandit(bandit, rewards)`. Those have not landed, so this file mirrors
 * the frozen signatures. Every call site goes through the exported functions
 * and none of them widens a contract type.
 *
 * `ponytail:` ceiling. `sampleWeights` uses Johnk's theorem for an exact Beta
 * draw, which is correct but assumes independent uniforms. Once session 4
 * lands, delete this file and point the three call sites at `@/lib/engine`.
 */

/** Weights are visible, so a wrong default is a bug a traveller can see. */
export const PRIOR_WEIGHTS: Weights = {
  interest: 1,
  rating: 0.8,
  value: 0.7,
  authenticity: 0.6,
  weather: 0.9,
  crowd: 0.6,
  novelty: 0.8,
  groupFit: 0.8,
  travelFriction: 0.5,
  reliability: 0.5,
  travelPenalty: 0.012,
  pacePenalty: 0.7,
};

export const WEIGHT_IDS = [
  "interest",
  "rating",
  "value",
  "authenticity",
  "weather",
  "crowd",
  "novelty",
  "groupFit",
  "travelFriction",
  "reliability",
  "travelPenalty",
  "pacePenalty",
] as const satisfies readonly (keyof Weights)[];

/** What each weight is allowed to reach. Sliders read these bounds. */
export const WEIGHT_BOUNDS: Record<keyof Weights, { min: number; max: number; step: number }> = {
  interest: { min: 0, max: 2, step: 0.05 },
  rating: { min: 0, max: 2, step: 0.05 },
  value: { min: 0, max: 2, step: 0.05 },
  authenticity: { min: 0, max: 2, step: 0.05 },
  weather: { min: 0, max: 2, step: 0.05 },
  crowd: { min: 0, max: 2, step: 0.05 },
  novelty: { min: 0, max: 2, step: 0.05 },
  groupFit: { min: 0, max: 2, step: 0.05 },
  travelFriction: { min: 0, max: 2, step: 0.05 },
  reliability: { min: 0, max: 2, step: 0.05 },
  travelPenalty: { min: 0, max: 0.05, step: 0.001 },
  pacePenalty: { min: 0, max: 2, step: 0.05 },
};

/** One plain-English line per weight, so the slider is not a bare number. */
export const WEIGHT_MEANING: Record<keyof Weights, string> = {
  interest: "How much your search words push a match up.",
  rating: "How much a review-based rating matters, measured as a Wilson lower bound.",
  value: "How much price against your per-person budget matters.",
  authenticity: "How much a resident-facing place beats a tourist trap.",
  weather: "How hard bad weather rules a place out.",
  crowd: "How much a crowded peak hour is penalised.",
  novelty: "How much two stops of the same kind are penalised.",
  groupFit: "How much a toddler, an elderly traveller, or an access need matters.",
  travelFriction: "How much distance from where you stand matters.",
  reliability: "How much a provider's track record matters. No record scores a neutral 0.5 today.",
  travelPenalty: "Extra penalty per superlinear travel increment. Distance costs more than time.",
  pacePenalty: "How hard a plan is penalised for missing the stop count you wanted.",
};

function arm(component: ComponentId, pulls = 0): BanditArm {
  return { component, alpha: 1, beta: 1, pulls };
}

export function priorBandit(now: string): BanditState {
  return {
    arms: COMPONENT_IDS.map((component) => arm(component)),
    observations: 0,
    updatedAt: now,
  };
}

/**
 * Seeded 32-bit LCG. Deterministic runs mean a demo replays identically, which
 * is what makes the drift and screenshot comparisons meaningful.
 */
export function lcg(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Exact Beta(alpha, beta) draw by Johnk's theorem: two independent uniforms
 * raised to inverse shape parameters and normalised. Three lines, no rejection
 * loop, no allocation, and it is the real distribution rather than a bell curve
 * standing in for it.
 */
function betaSample(alpha: number, beta: number, u: number, v: number): number {
  const a = u ** (1 / alpha);
  const b = v ** (1 / beta);
  const total = a + b;
  return total > 0 ? a / total : 0.5;
}

/**
 * Thompson-sample every weight. The perturbation shrinks as observations grow,
 * so an untouched prior stays put and a well-observed arm explores narrowly.
 */
export function sampleWeights(
  bandit: BanditState,
  rng: () => number,
  base: Weights = PRIOR_WEIGHTS,
): Weights {
  const out = { ...base };
  for (const item of bandit.arms) {
    const key = item.component as keyof Weights;
    if (!(key in out)) continue;
    const spread = 1 / (1 + item.pulls);
    const drawn = betaSample(item.alpha, item.beta, rng(), rng());
    const jitter = (drawn - 0.5) * 2 * spread * WEIGHT_BOUNDS[key].max * 0.25;
    out[key] = clampWeight(key, out[key] + jitter);
  }
  return out;
}

export function clampWeight(key: keyof Weights, value: number): number {
  const bounds = WEIGHT_BOUNDS[key];
  const rounded = Math.round(value / bounds.step) * bounds.step;
  const fixed = Number(rounded.toFixed(4));
  if (!Number.isFinite(fixed)) return PRIOR_WEIGHTS[key];
  return Math.min(bounds.max, Math.max(bounds.min, fixed));
}

/** One interaction: the arm won if its reward cleared the 0.5 line. */
export function updateBandit(
  bandit: BanditState,
  rewards: Partial<Record<ComponentId, number>>,
  now: string,
): BanditState {
  return {
    observations: bandit.observations + 1,
    updatedAt: now,
    arms: bandit.arms.map((item) => {
      const reward = rewards[item.component];
      if (reward === undefined) return item;
      const good = reward > 0.5;
      return {
        ...item,
        alpha: item.alpha + (good ? 1 : 0),
        beta: item.beta + (good ? 0 : 1),
        pulls: item.pulls + 1,
      };
    }),
  };
}

/**
 * A traveller choosing a place is a positive signal for the components that
 * actually drove that place up. Only components with a non-zero contribution
 * count, so a neutral 0.5 never masquerades as a preference.
 */
export function rewardForChoice(
  contributions: { id: ComponentId; contribution: number }[],
): Partial<Record<ComponentId, number>> {
  const rewards: Partial<Record<ComponentId, number>> = {};
  for (const item of contributions) {
    if (item.contribution > 0.01) rewards[item.id] = 1;
  }
  return rewards;
}

/* ── persistence ────────────────────────────────────────────────────────── */

export const LEARNER_KEY = "ananta-learner";

export type LearnerState = {
  weights: Weights;
  bandit: BanditState;
  /** Ids already counted, so a re-render never double-counts one choice. */
  countedChoices: string[];
};

export function readLearner(now: string): LearnerState {
  const fallback: LearnerState = {
    weights: { ...PRIOR_WEIGHTS },
    bandit: priorBandit(now),
    countedChoices: [],
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(LEARNER_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<LearnerState>;
    if (!parsed || typeof parsed !== "object") return fallback;
    return {
      weights: { ...PRIOR_WEIGHTS, ...(parsed.weights ?? {}) },
      bandit: parsed.bandit?.arms?.length ? parsed.bandit : fallback.bandit,
      countedChoices: Array.isArray(parsed.countedChoices) ? parsed.countedChoices : [],
    };
  } catch {
    return fallback;
  }
}

export function writeLearner(state: LearnerState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEARNER_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event("ananta-learner-change"));
  } catch {
    /* A full or blocked localStorage must not break the page. */
  }
}

export function resetLearner(now: string): LearnerState {
  const fresh: LearnerState = {
    weights: { ...PRIOR_WEIGHTS },
    bandit: priorBandit(now),
    countedChoices: [],
  };
  writeLearner(fresh);
  return fresh;
}

/** Successive clicks on the same control must not land on the same tick. */
export function isNewChoice(counted: string[], key: string, max = 40): boolean {
  return !counted.includes(key) && counted.length < max;
}
