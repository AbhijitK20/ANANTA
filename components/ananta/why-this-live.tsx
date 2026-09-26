"use client";

import { useEffect, useState } from "react";
import { getCityManifest, type ExperienceV2, type Stop, type Weights } from "@/lib/engine";
import { readLearner } from "@/components/ananta/learning";
import { anantaRecords } from "@/components/ananta/records";
import {
  contextFromInput,
  makeTravelOptions,
  objectiveFast,
  probe,
  stopComponents,
  todayStamp,
  type EngineInput,
} from "@/components/ananta/pipeline";
import { WhyThis } from "@/components/ananta/why-this";

/**
 * `WhyThis` on the detail page, read against the traveller's own edited weights
 * rather than the prior. The server render of this page cannot touch
 * `localStorage`, so a server-only panel would quietly disagree with the card
 * the traveller clicked in Explore. This is the smallest thing that stops that,
 * and it renders nothing until the weights are known, so there is no flash of a
 * number that is about to change.
 */
export function WhyThisLive({ record, input }: { record: ExperienceV2; input: EngineInput }) {
  const [weights, setWeights] = useState<Weights | null>(null);

  useEffect(() => {
    const sync = () => setWeights(readLearner(`${todayStamp()}T00:00:00+05:30`).weights);
    sync();
    window.addEventListener("ananta-learner-change", sync);
    return () => window.removeEventListener("ananta-learner-change", sync);
  }, []);

  if (!weights) {
    return (
      <p className="mt-5 text-sm text-muted" role="status">
        Reading the weights you set...
      </p>
    );
  }

  const ctx = contextFromInput(input, getCityManifest(input.cityId));
  const single: Stop = probe(record, ctx, makeTravelOptions(ctx, anantaRecords));
  return (
    <WhyThis
      components={stopComponents(single, ctx, weights)}
      total={objectiveFast([single], ctx, weights).value}
      title="Why this ranks where it does"
      note="Ranked by magnitude, largest contribution first. A low total can still be the best on offer."
    />
  );
}
