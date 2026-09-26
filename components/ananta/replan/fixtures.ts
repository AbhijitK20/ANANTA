import type { DiscoveryContext, Plan, Stop } from "@/lib/engine";
import { anantaById } from "@/components/ananta/records";

/**
 * Test fixtures for the replan panel.
 *
 * The travel numbers here are deliberately synthetic and obviously so. This test
 * is about intent preservation, and it must not fail because a travel estimate
 * moved or because a congestion multiplier changed. Anything that needs the real
 * travel model belongs in a stage test, not here.
 *
 * The records themselves are real, pulled from `records.ts` by id, so a category
 * assertion means something.
 */

const IDS = ["marine-drive-sunset-walk", "girgaon-chowpatty-snack-trail", "shivaji-park-heritage-loop"] as const;

const syntheticLeg = (index: number): { minutes: number; km: number } => ({
  minutes: 10 + index * 5,
  km: 1.5 + index,
});

function stop(id: string, index: number, visitMinutes: number): Stop {
  const record = anantaById[id];
  if (!record) throw new Error(`Fixture record "${id}" is not in the catalogue.`);
  const leg = syntheticLeg(index);
  return {
    record,
    arriveBy: leg.minutes,
    travelMinutes: leg.minutes,
    travelKm: leg.km,
    visitMinutes,
    bufferMinutes: 15,
    costInr: record.priceInr * 2,
  };
}

export function makeStops(): Stop[] {
  return [stop(IDS[0], 0, 60), stop(IDS[1], 1, 90), stop(IDS[2], 2, 60)];
}

export function makePlan(stops: Stop[] = makeStops(), createdFrom?: DiscoveryContext): Plan {
  return {
    id: "fixture-plan",
    stops,
    objective: {
      value: 1,
      breakdown: {
        total: 1,
        components: [],
        aggregate: { travel: 0, crowd: 0, novelty: 0, proximity: 0, pace: 0 },
      },
    },
    // The proposal reads `plan.createdFrom.original` to name the intent, so a
    // fixture without a context would crash the render. The tests that do not
    // care about intent leave it undefined and never read it.
    createdFrom: createdFrom as DiscoveryContext,
  };
}
