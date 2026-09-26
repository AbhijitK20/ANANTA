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
 * Why this file exists, and how it differs from `why-this.tsx`.
 *
 * `why-this.tsx` is a pure presentational panel. It renders whatever component
 * list it is handed and it makes no claims of its own. This is the one place
 * that panel is fed from the traveller's *edited* weights rather than the
 * server-rendered prior, and it is a genuine live variant rather than a second
 * copy of the same idea.
 *
 * The reason it has to exist at all is that the server render of the detail page
 * cannot touch `localStorage`. A server-only panel would show the prior and then
 * silently disagree with the number the traveller set on the profile page, and
 * two panels on two screens showing two scores for one record is the worst
 * outcome in the explanation layer.
 *
 * Two rules keep the two components from drifting:
 *
 *  1. There is no second renderer. This file computes a context and hands the
 *     same `<WhyThis>` the same props any other caller would. If the panel
 *     changes, both change.
 *  2. The total and the rows come from one call site, with one `ctx` and one
 *     `weights` object. `objectiveFast` and `stopComponents` are each given the
 *     identical pair, so the headline number and the ranked rows underneath it
 *     are always derived from the same arithmetic. A divergence between them
 *     would mean a total that does not equal the sum of its own list, which is
 *     the number a sceptical reader checks first.
 *
 * It renders nothing until the weights are known, so there is no flash of a
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
      note="Ranked by magnitude, largest contribution first, using the weights you set. A low total can still be the best on offer."
    />
  );
}
