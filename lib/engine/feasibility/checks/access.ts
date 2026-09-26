import type { AccessNeed, DiscoveryContext, Rejection, RejectionCode, TravellerProfile } from "@/lib/engine/contracts";
import { abstain, fieldCause, reject } from "../sentence";
import type { Check } from "./index";

/**
 * Accessibility. Three states, never two: satisfied, known not satisfied, and
 * unknown. The first two are facts, the third is a fact about our data, and it
 * is reported as its own code so nobody reads an unknown as a yes.
 */

const NEED_CODE: Record<AccessNeed, RejectionCode> = {
  step_free: "not_step_free",
  stroller_ok: "not_stroller_ok",
  accessible_restroom: "no_accessible_restroom",
  low_walking: "requires_steps",
  seating_available: "no_seating",
  quiet_space: "not_quiet_enough",
  // No dedicated code exists for service animals in the frozen union. The
  // non-asserting code is used so the need still reaches the provider feed
  // rather than being dropped. See SESSION/BLOCKERS/3.md.
  service_animal_ok: "unverified_required_fact",
};

/**
 * How each need is named in a sentence. A named fact, not prose: the code table
 * does the phrasing, this only supplies the subject.
 */
const NEED_FACT: Record<AccessNeed, string> = {
  step_free: "step-free access",
  stroller_ok: "stroller access",
  accessible_restroom: "an accessible restroom",
  low_walking: "a low-walking route",
  seating_available: "seating",
  quiet_space: "a quiet space",
  service_animal_ok: "service animal access",
};

/**
 * Needs the traveller has marked non-negotiable. Read defensively off the
 * profile so session 1's frozen `TravellerProfile` does not have to change for
 * this stage to ship.
 * ponytail: a request to add `hardAccessNeeds: AccessNeed[]` to
 * `TravellerProfile` is in SESSION/BLOCKERS/3.md; the cast goes away then.
 */
export function hardAccessNeeds(ctx: DiscoveryContext): ReadonlySet<AccessNeed> {
  const declared = (ctx.profile as TravellerProfile & { hardAccessNeeds?: AccessNeed[] }).hardAccessNeeds;
  return new Set(declared ?? []);
}

export const checkAccess: Check = (record, ctx) => {
  const cause = fieldCause(record, "accessibility");
  const hard = hardAccessNeeds(ctx);
  const rejections: Rejection[] = [];

  for (const need of ctx.accessNeeds) {
    const state = record.access[need];
    if (state === true) continue;
    if (state === false) {
      // The code's own lead already names the missing feature, so passing an
      // `extra` here would only replace a finished clause with a bare token.
      rejections.push(reject(NEED_CODE[need], {}, cause));
      continue;
    }
    // Missing key. The traveller asked and our data cannot answer. Surface it,
    // and make it binding when they told us the need is non-negotiable.
    rejections.push(abstain(cause, NEED_FACT[need], hard.has(need)));
  }
  return rejections;
};
