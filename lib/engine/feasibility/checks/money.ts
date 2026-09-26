import { abstain, fieldCause, reject } from "../sentence";
import type { Check } from "./index";

/**
 * Money. The gate decides affordability; the objective decides whether the
 * stop is worth it.
 *
 * ponytail: which figure was used, per-head or the listed price, is disclosed by
 * the code that fired rather than by an `extra`. The codes table returns early
 * on `extra`, so passing one here would throw away the rupee shortfall that
 * makes the sentence useful. `over_budget_per_person` versus `over_budget` is
 * the disclosure. Upgrade path: session 1 appending the magnitude clause after
 * `extra` instead of returning, which would let both appear.
 */
export const checkMoney: Check = (record, ctx) => {
  const cause = fieldCause(record, "price");

  // A price nobody has confirmed is not a price. We abstain rather than guess
  // in either direction, which is what keeps the provider feed honest.
  if (record.confidence.price === "unverified") return [abstain(cause, "price")];

  const perPerson = record.pricePerPersonInr ?? record.priceInr;
  if (perPerson === null || !Number.isFinite(perPerson)) return [abstain(cause, "price")];

  const party = Math.max(1, ctx.partySize);

  // One head already costs more than the whole budget. More specific, and more
  // damning, than the party total.
  if (perPerson > ctx.budgetInr) {
    return [reject("over_budget_per_person", { shortfall: perPerson - ctx.budgetInr, unit: "inr" }, cause)];
  }

  const total = perPerson * party;
  if (total > ctx.budgetInr) {
    return [reject("over_budget", { shortfall: total - ctx.budgetInr, unit: "inr" }, cause)];
  }
  return [];
};
