"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { demoUserLocation } from "@/lib/location";
import { readPlan, writePlan } from "@/lib/plan";
import { readLearner, type LearnerState } from "@/components/ananta/learning";
import { type EngineInput, runPipeline, todayStamp, type PipelineRun } from "@/components/ananta/pipeline";

/**
 * The two client-side stores the traveller screens share: the draft plan and the
 * learner's weights. Both live in `localStorage`, both broadcast an event, and
 * both are read through one hook so no screen writes its own copy.
 *
 * This file imports nothing from `lib/engine`. Every engine symbol it needs
 * arrives through `@/components/ananta/pipeline`, which is the single import
 * path for the view layer, so there is exactly one place where the engine and
 * the screens meet.
 */

export function useLearner(): [LearnerState, (next: LearnerState) => void] {
  const [state, setState] = useState<LearnerState | null>(null);

  useEffect(() => {
    const sync = () => setState(readLearner(`${todayStamp()}T00:00:00+05:30`));
    sync();
    window.addEventListener("ananta-learner-change", sync);
    return () => window.removeEventListener("ananta-learner-change", sync);
  }, []);

  const value = useMemo<LearnerState>(
    // The fallback asks `readLearner` for an empty state rather than building
    // one here. A hand-written default has to be kept in step with
    // `LearnerState`, and when session 7 added `resetReason` this line was the
    // only thing that broke. Reading the prior keeps the shape in one place.
    () => state ?? readLearner(`${todayStamp()}T00:00:00+05:30`),
    [state],
  );
  return [value, setState];
}

export function usePlanIds(): [string[], (next: string[]) => void, (id: string) => boolean, (id: string) => void] {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setIds(readPlan());
    sync();
    window.addEventListener("ananta-plan-change", sync);
    return () => window.removeEventListener("ananta-plan-change", sync);
  }, []);

  const commit = useCallback((next: string[]) => {
    writePlan(next);
    setIds(next);
  }, []);

  const has = useCallback((id: string) => ids.includes(id), [ids]);
  const toggle = useCallback((id: string) => {
    const current = readPlan();
    writePlan(current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }, []);

  return [ids, commit, has, toggle];
}

/** The demo traveller's fixed position, in the shape the engine wants. */
export const DEMO_ORIGIN = {
  coordinates: demoUserLocation.coordinates,
  label: demoUserLocation.label,
  area: demoUserLocation.area,
};

/** Defaults shared by both screens so they cannot drift apart. */
export function defaultEngineInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    query: "",
    cityId: "mumbai",
    city: "All",
    category: "All",
    zone: "All",
    availableMinutes: 240,
    budgetInr: 1500,
    startTime: "10:00",
    deadline: null,
    rainMode: false,
    freeOnly: false,
    communityOnly: false,
    bestTimeOfDay: "any",
    partySize: 1,
    hasToddler: false,
    hasElderly: false,
    pace: "normal",
    idealStops: 3,
    minStops: 1,
    travelMode: "walk",
    planIds: [],
    originCoordinates: DEMO_ORIGIN.coordinates,
    originLabel: DEMO_ORIGIN.label,
    originArea: DEMO_ORIGIN.area,
    ...overrides,
  };
}

export function usePipeline(
  input: EngineInput,
  weights: LearnerState["weights"],
): PipelineRun | null {
  return useMemo(() => (weights ? runPipeline(input, weights) : null), [input, weights]);
}
