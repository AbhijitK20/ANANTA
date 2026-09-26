import type { CityManifest, Rejection } from "@/lib/engine/contracts";
import { fieldCause, reject } from "../sentence";
import type { Check } from "./index";

/**
 * Plan state: what the traveller already refused, already holds, or already
 * has. `duplicate` is a distance, not a string comparison, because two ids for
 * the same doorway are not two experiences.
 */

/** ponytail: `CityManifest` has no `duplicateRadiusKm`; see SESSION/BLOCKERS/3.md. */
export const DEFAULT_DUPLICATE_RADIUS_KM = 0.5;

export function duplicateRadiusKm(city: CityManifest): number {
  const declared = (city as CityManifest & { duplicateRadiusKm?: number }).duplicateRadiusKm;
  return typeof declared === "number" && Number.isFinite(declared) && declared >= 0
    ? declared
    : DEFAULT_DUPLICATE_RADIUS_KM;
}

/**
 * Great-circle kilometres. Deliberately local rather than imported: the engine
 * must not depend on a v1 UI helper that session 9 may reshape, and session 6
 * derives distances independently on purpose.
 */
function haversineKm(from: [number, number], to: [number, number]): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(to[1] - from[1]);
  const dLng = toRad(to[0] - from[0]);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(from[1])) * Math.cos(toRad(to[1])) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export const checkPlanState: Check = (record, ctx, position) => {
  const rejections: Rejection[] = [];

  if (ctx.profile.excludes.includes(record.id)) {
    rejections.push(reject("excluded_by_traveller", {}, fieldCause(record, "name")));
  }

  // A pin is a stop the traveller already committed to, so it is not a fresh
  // candidate. Packing adds pins directly instead of retrieving them again.
  const alreadyInPlan = ctx.profile.pins.includes(record.id)
    || position.planned.some((stop) => stop.id === record.id);
  if (alreadyInPlan) {
    rejections.push(reject("already_planned", {}, fieldCause(record, "name")));
  }

  const radiusKm = duplicateRadiusKm(ctx.city);
  for (const stop of position.planned) {
    const km = haversineKm(stop.coordinates, record.coordinates);
    if (km <= radiusKm) {
      // How far inside the duplicate radius it sits, in metres, so the
      // sentence can say how close is close.
      rejections.push(reject("duplicate", { shortfall: Math.max(1, Math.round((radiusKm - km) * 1000)), unit: "metres" }, fieldCause(record, "coordinates")));
      break;
    }
  }

  return rejections;
};
