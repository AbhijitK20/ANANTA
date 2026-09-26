import { reject } from "../sentence";
import { budgetMinutes } from "./time";
import type { Check } from "./index";

/**
 * Reachability. Session 2 owns the isochrone; this stage must not import it, so
 * reachability arrives as an injected travel time on `position` and is judged
 * against the manifest's own bbox.
 */

function insideBbox(coordinates: [number, number], bbox: [number, number, number, number]): boolean {
  const [lng, lat] = coordinates;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  const [west, south, east, north] = bbox;
  return lng >= west && lat >= south && lng <= east && lat <= north;
}

export const checkIso: Check = (record, ctx, position) => {
  const cause = { provenance: record.provenance.coordinates, confidence: record.confidence.coordinates ?? "estimate" };
  const reachable = Number.isFinite(position.travelMinutes)
    && position.travelMinutes >= 0
    && insideBbox(record.coordinates, ctx.city.bbox);

  // A zero-minute leg is a neighbour, not a missing route. Only an unusable
  // travel time or a record outside the city's own bbox means no route exists.
  if (!reachable) return [reject("no_route", {}, cause)];

  const budget = budgetMinutes(ctx);
  if (position.travelMinutes > budget) {
    return [reject("too_far", { shortfall: position.travelMinutes - budget, unit: "minutes" }, cause)];
  }
  return [];
};
