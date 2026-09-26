import type { Rejection } from "@/lib/engine/contracts";
import { fieldCause, reject } from "../sentence";
import type { Check } from "./index";

/**
 * Availability. Lead time is measured against the real gap between now and the
 * planned arrival, so a provider who needs a day's notice is never offered a
 * slot the traveller cannot reach.
 */
export const checkAvailability: Check = (record, ctx, position) => {
  const cause = fieldCause(record, "booking");
  const { availability } = record;
  const rejections: Rejection[] = [];

  const soldOutAt = availability.soldOutAt === null ? Number.NaN : Date.parse(availability.soldOutAt);
  if (Number.isFinite(soldOutAt) && soldOutAt <= Date.parse(ctx.now) + position.startOffsetMin * 60000) {
    rejections.push(reject("sold_out", {}, cause));
  }

  const lead = availability.leadTimeMinutes;
  if (Number.isFinite(lead) && lead > 0) {
    if (availability.bookingUrl === null) {
      // They need notice and there is no way to give it. That is the booking
      // code, not a lead time one: more waiting will not help.
      rejections.push(reject("requires_booking_not_available", {}, cause));
    } else if (lead > position.startOffsetMin) {
      rejections.push(reject("lead_time_too_short", { shortfall: lead - position.startOffsetMin, unit: "minutes" }, cause));
    }
  }
  return rejections;
};
