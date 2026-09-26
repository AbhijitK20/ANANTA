import { abstain, fieldCause, reject } from "../sentence";
import type { Check } from "./index";

/**
 * Diet. Silence about diets is only good news when somebody verified it, so an
 * empty list is read through the field's confidence rather than on its own.
 */
export const checkDiet: Check = (record, ctx) => {
  if (!ctx.diets.length) return [];
  const cause = fieldCause(record, "diet");
  const missing = ctx.diets.filter((need) => !record.diets.includes(need));
  if (!missing.length) return [];

  // Nobody has told us what is served here, so we cannot claim a mismatch.
  if (!record.diets.length && record.confidence.diet !== "verified") {
    return [abstain(cause, "dietary options")];
  }
  return [reject("diet_mismatch", { extra: missing.join(", ") }, cause)];
};
