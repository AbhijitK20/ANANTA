import type { EventSeed } from "@/lib/seed";

export type EventStatus = "Happening now" | "Starting soon" | "Upcoming" | "Already ended" | "Cannot reach in time";

export type EventEvaluation = {
  event: EventSeed;
  status: EventStatus;
  reachable: boolean;
  reason: string;
};

export function eventStatus(event: EventSeed, nowMinutes: number): EventStatus {
  if (nowMinutes >= event.endMinutes) return "Already ended";
  if (nowMinutes >= event.startMinutes) return "Happening now";
  if (event.startMinutes - nowMinutes <= event.travelMinutes) return "Cannot reach in time";
  if (event.startMinutes - nowMinutes <= 60) return "Starting soon";
  return "Upcoming";
}

export function evaluateEvents(events: EventSeed[], nowMinutes: number) {
  const reachable: EventEvaluation[] = [];
  const excluded: EventEvaluation[] = [];
  for (const event of events) {
    const status = eventStatus(event, nowMinutes);
    const evaluation: EventEvaluation = { event, status, reachable: status !== "Already ended" && status !== "Cannot reach in time", reason: describeReason(event, status, nowMinutes) };
    if (evaluation.reachable) reachable.push(evaluation);
    else excluded.push(evaluation);
  }
  reachable.sort((a, b) => a.event.startMinutes - b.event.startMinutes);
  return { reachable, excluded };
}

export type EventChange = {
  field: "Venue" | "Start time" | "Price";
  from: string;
  to: string;
};

/** Detects deltas between the last verified snapshot and the current record. */
export function eventChanges(event: EventSeed): EventChange[] {
  const changes: EventChange[] = [];
  if (event.previousVenue && event.previousVenue !== event.venue) changes.push({ field: "Venue", from: event.previousVenue, to: event.venue });
  if (event.previousStartMinutes !== undefined && event.previousStartMinutes !== event.startMinutes) {
    changes.push({ field: "Start time", from: `${event.previousStartMinutes} minutes after the reference time`, to: `${event.startMinutes} minutes after the reference time` });
  }
  if (event.previousPrice && event.previousPrice !== event.price) changes.push({ field: "Price", from: event.previousPrice, to: event.price });
  return changes;
}

function describeReason(event: EventSeed, status: EventStatus, nowMinutes: number) {
  const gap = event.startMinutes - nowMinutes;
  if (status === "Already ended") return "This demo event window has already passed.";
  if (status === "Cannot reach in time") return `Starts in ${gap} minutes but needs about ${event.travelMinutes} minutes to reach.`;
  if (status === "Happening now") return `Running now and about ${event.travelMinutes} minutes away.`;
  if (status === "Starting soon") return `Starts in ${gap} minutes and needs about ${event.travelMinutes} minutes to reach.`;
  return `Starts in about ${gap} minutes.`;
}
