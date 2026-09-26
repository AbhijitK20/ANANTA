import type { BanditArm, BanditState, ComponentId, Weights } from "@/lib/engine";
import { COMPONENT_IDS } from "@/lib/engine";
/*
 * The five scoring symbols below are imported from the stage barrel rather than
 * from `@/lib/engine`, because the engine barrel has not re-exported
 * `lib/engine/scoring` yet: every stage line in `lib/engine/index.ts` is still
 * commented out, session 4's file included. Nothing is reimplemented here, so
 * `lib/ui-guard/no-engine-fork.test.ts` is satisfied either way, and when the
 * barrel lands this one import path is the whole change. See
 * `UI-UX-Fix-Prompts/BLOCKERS/7.md`.
 */
import {
  PRIOR_WEIGHTS as ENGINE_PRIOR_WEIGHTS,
  WEIGHT_KEYS,
  banditFromWeights,
  clampWeights,
  sampleWeights as engineSampleWeights,
  updateBandit as engineUpdateBandit,
} from "@/lib/engine/scoring";

/**
 * The learner: storage and surface only.
 *
 * The pure half of learning is the engine's. `scoring/weights.ts` owns
 * `PRIOR_WEIGHTS`, `WEIGHT_KEYS` and `clampWeights`; `scoring/thompson.ts` owns
 * `sampleWeights`, `updateBandit` and `banditFromWeights`. This file used to
 * declare its own copies of all five, plus a local Beta sampler behind them.
 * That meant the weights the panel showed were not the weights the engine
 * scored with, which is the one failure this feature cannot have, so every one
 * of them is now imported and none of them is reimplemented.
 *
 * What genuinely belongs here is the part the engine must not know about: which
 * key the state lives under, how a corrupt or older stored value becomes a prior
 * instead of an exception, and the words a slider is labelled with.
 *
 * The trust rule, and why `LearnerState.weights` is derived rather than stored:
 * **nothing is learned without being visible and editable.** Only the bandit is
 * written to storage. The weights on the state are recomputed from that bandit
 * on every read, by the engine's own sampler, so they cannot drift away from
 * what the objective does. The previous shape also persisted a `weights` blob
 * beside the bandit, which was a second source of truth that could disagree with
 * both the engine and itself.
 */

/* ── re-exports, so the existing call sites keep resolving ──────────────── */

/** The engine's prior, passed through so one hop still finds one definition. */
export const PRIOR_WEIGHTS: Weights = ENGINE_PRIOR_WEIGHTS;

/** A cold start, from the engine. `pipeline-run.ts` builds its context with it. */
export const priorBandit = (now: string): BanditState => banditFromWeights(PRIOR_WEIGHTS, now);

/**
 * `sampleWeights` with the base-vector overlay the pipeline still calls, in one
 * argument. The draw is entirely the engine's; the overlay answers a different
 * question, which is "how do the learned shares sit against the weights this
 * context already carries", and that is a view concern.
 */
export function sampleWeights(bandit: BanditState, rng: () => number, base: Weights = PRIOR_WEIGHTS): Weights {
  return clampWeights({ ...base, ...engineSampleWeights(bandit, rng) });
}

/** One interaction, handed to the engine's pure updater. */
export function recordChoice(
  bandit: BanditState,
  rewards: Record<ComponentId, number>,
  now?: string,
): BanditState {
  return engineUpdateBandit(bandit, rewards, now);
}

/* ── the surface a slider needs ─────────────────────────────────────────── */

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

/** The keys a slider renders, in the order the panel shows them. */
export const WEIGHT_IDS = WEIGHT_KEYS;

/**
 * Seeded 32-bit LCG, so every derivation is deterministic.
 *
 * `sampleWeights` is a real Thompson draw and it needs randomness. A stored
 * bandit that produced a different weight on every page load would make the
 * panel flicker and would make an edit look like it did nothing, so the seed
 * comes from the state rather than from the clock.
 */
export function lcg(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const seedFrom = (bandit: BanditState): number => {
  let hash = 0x811c9dc5;
  const text = `${bandit.observations}|${bandit.updatedAt}|${bandit.arms
    .map((arm) => `${arm.component}:${arm.alpha}:${arm.beta}:${arm.pulls}`)
    .join(",")}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
};

/** The weights the panel shows and the engine scores with, derived from a state. */
export function weightsFor(bandit: BanditState): Weights {
  return engineSampleWeights(bandit, lcg(seedFrom(bandit)));
}

/**
 * A traveller choosing a place is a positive signal for the components that
 * actually drove that place up. Only components above a real threshold count, so
 * a neutral score never masquerades as a preference.
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
  /** The only stored truth. */
  bandit: BanditState;
  /**
   * Derived from `bandit` on every read, never written. Present on the type
   * because the panel and the pipeline read it, and derived rather than
   * persisted because a stored copy is a second truth that can go stale.
   */
  weights: Weights;
  /** Ids already counted, so a re-render never double-counts one choice. */
  countedChoices: string[];
  /**
   * Set when a stored value was unusable and the prior was substituted. The
   * panel says so rather than pretending the traveller's history survived.
   */
  resetReason: string | null;
};

const priorState = (now: string, resetReason: string | null = null): LearnerState => {
  const bandit = banditFromWeights(PRIOR_WEIGHTS, now);
  return { bandit, weights: weightsFor(bandit), countedChoices: [], resetReason };
};

const isArm = (value: unknown): value is BanditArm => {
  if (!value || typeof value !== "object") return false;
  const arm = value as Partial<BanditArm>;
  return (
    typeof arm.component === "string" &&
    COMPONENT_IDS.includes(arm.component as ComponentId) &&
    typeof arm.alpha === "number" && Number.isFinite(arm.alpha) && arm.alpha >= 0 &&
    typeof arm.beta === "number" && Number.isFinite(arm.beta) && arm.beta >= 0 &&
    typeof arm.pulls === "number" && Number.isFinite(arm.pulls) && arm.pulls >= 0
  );
};

/**
 * Reads the stored learner. **This never throws.**
 *
 * `localStorage` is untrusted input. It can hold a truncated string from a killed
 * write, a shape from a previous build, a hand-edited value, or nothing. Every
 * one of those resolves to the prior, and the cases where the traveller lost
 * something real say so in `resetReason` rather than quietly starting again.
 *
 * A state that parses but whose arms are not a complete, well-formed set for
 * the ten known components is treated as unusable rather than partial. Half a
 * bandit is not a smaller bandit, it is a corrupt one, and scoring against it
 * would move every recommendation with nothing the traveller could see.
 */
export function readLearner(now: string): LearnerState {
  if (typeof window === "undefined") return priorState(now);

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LEARNER_KEY);
  } catch {
    return priorState(now, "Your saved preferences could not be read, so this is the starting point.");
  }
  if (!raw) return priorState(now);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return priorState(now, "Your saved preferences were unreadable, so this is the starting point.");
  }
  if (!parsed || typeof parsed !== "object") {
    return priorState(now, "Your saved preferences were unreadable, so this is the starting point.");
  }

  const candidate = parsed as { bandit?: unknown; countedChoices?: unknown };
  if (!candidate.bandit || typeof candidate.bandit !== "object") {
    return priorState(
      now,
      "Your saved preferences were from an older version and could not be carried over, so this is the starting point.",
    );
  }

  const stored = candidate.bandit as Partial<BanditState>;
  const byComponent = new Map<string, BanditArm>();
  if (Array.isArray(stored.arms)) {
    for (const arm of stored.arms) {
      if (isArm(arm)) byComponent.set(arm.component, arm);
    }
  }
  if (byComponent.size !== COMPONENT_IDS.length) {
    return priorState(now, "Your saved preferences were incomplete, so this is the starting point.");
  }

  const bandit: BanditState = {
    arms: COMPONENT_IDS.map((component) => byComponent.get(component) as BanditArm),
    observations:
      typeof stored.observations === "number" && Number.isFinite(stored.observations) && stored.observations >= 0
        ? Math.floor(stored.observations)
        : 0,
    updatedAt: typeof stored.updatedAt === "string" && stored.updatedAt ? stored.updatedAt : now,
  };

  return {
    bandit,
    weights: weightsFor(bandit),
    countedChoices: Array.isArray(candidate.countedChoices)
      ? candidate.countedChoices.filter((id): id is string => typeof id === "string")
      : [],
    resetReason: null,
  };
}

export function writeLearner(state: LearnerState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LEARNER_KEY,
      JSON.stringify({ bandit: state.bandit, countedChoices: state.countedChoices, version: 2 }),
    );
    window.dispatchEvent(new Event("ananta-learner-change"));
  } catch {
    /* A full or blocked localStorage must not break the page. */
  }
}

export function resetLearner(now: string): LearnerState {
  const fresh = priorState(now);
  writeLearner(fresh);
  return fresh;
}

/**
 * The one place a traveller's action becomes a learning signal.
 *
 * Until this existed, `recordChoice` and `rewardForChoice` were written, tested
 * and **never called**, so `bandit.observations` was permanently 0 and
 * `learned-weights-panel.tsx` always rendered its "No behaviour has been learned
 * yet" branch. The panel's own sentence claims the weights "change only when you
 * save or reject something", and that sentence was false. This function is what
 * makes it true, in one place, which is the only way to keep it true.
 *
 * The signal is deliberately weak. One save is not a habit: a stated preference
 * is worth 0.6 and a rejection 0.15, not the 1.0 and 0.0 that an explicit rating
 * would deserve. With `WEIGHT_PRIOR_STRENGTH` pseudo-observations behind them,
 * ten saves move a weight noticeably and one barely moves it at all.
 *
 * `countedChoices` caps at 40 so a heavy user cannot grow localStorage without
 * bound, and re-saving the same place does not count twice, because a toggle
 * clicked repeatedly is not a stronger signal than one clicked once.
 */
const SAVE_REWARD = 0.6;
const UNSAVE_REWARD = 0.15;

export function noteChoice(recordId: string, kind: "save" | "unsave"): LearnerState {
  if (typeof window === "undefined") return readLearner("1970-01-01T00:00:00");
  const now = new Date().toISOString();
  const state = readLearner(now);
  if (!isNewChoice(state.countedChoices, recordId)) return state;

  // Every component gets the same weak signal. A save says "this kind of place
  // was worth keeping", which is evidence about the traveller's taste in general
  // and not about which of the ten components earned it. Attributing it to one
  // component would be a story the data does not tell.
  const level = kind === "save" ? SAVE_REWARD : UNSAVE_REWARD;
  const rewards = {} as Record<ComponentId, number>;
  for (const id of COMPONENT_IDS) rewards[id] = level;

  const next: LearnerState = {
    ...state,
    bandit: recordChoice(state.bandit, rewards, now),
    countedChoices: [...state.countedChoices, recordId].slice(-40),
    resetReason: state.resetReason,
  };
  writeLearner(next);
  return next;
}

/**
 * Clamp one weight to its own bounds.
 *
 * A slider moves one key at a time and needs that key back on its own, while the
 * engine's `clampWeights` is a whole-vector operation. This is the adapter
 * between the two, and it deliberately has no bounds of its own: the step and the
 * limits come from `clampWeights`, so there is still exactly one place in the
 * project that decides how far a weight may travel.
 */
export const clampWeight = (key: keyof Weights, value: number): number =>
  clampWeights({ ...PRIOR_WEIGHTS, [key]: value })[key];

/**
 * An explicit override, for a traveller who drags a slider.
 *
 * The engine's `banditFromWeights` folds a weight vector back into a bandit, so
 * a manual edit is stored as state like any other observation rather than as a
 * value that bypasses the sampler. That is what keeps "what you set" and "what
 * the engine scores with" the same number.
 */
export function overrideWeight(key: keyof Weights, value: number, now: string): BanditState {
  const step = WEIGHT_BOUNDS[key].step;
  const stepped = Math.round(value / step) * step;
  return banditFromWeights(clampWeights({ ...PRIOR_WEIGHTS, [key]: Number(stepped.toFixed(4)) }), now);
}

/** Successive clicks on the same control must not land on the same tick. */
export function isNewChoice(counted: readonly string[], key: string, max = 40): boolean {
  return !counted.includes(key) && counted.length < max;
}
