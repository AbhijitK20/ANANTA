import { abstain, fieldCause, reject } from "../sentence";
import type { Check } from "./index";

/**
 * Capacity. `null` means nobody knows the answer, and an unknown capacity is
 * never treated as room enough.
 */
export const checkCapacity: Check = (record, ctx) => {
  const cause = fieldCause(record, "capacity");
  const party = Math.max(1, ctx.partySize);

  if (record.capacity === null || !Number.isFinite(record.capacity)) {
    return [abstain(cause, "capacity")];
  }
  if (record.capacity < party) {
    return [reject("capacity_exceeded", { shortfall: party - record.capacity, unit: "seats" }, cause)];
  }
  return [];
};
