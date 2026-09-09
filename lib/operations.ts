export type OperationKind = "event" | "experience" | "media" | "hidden-gem";

export type OperationRecord = {
  id: string;
  kind: OperationKind;
  title: string;
  area: string;
  source: string;
  status: "Needs review" | "Verified" | "Stale";
  detail: string;
  lastChecked: string;
};

export const operationSeed: OperationRecord[] = [
  { id: "op-event-fort", kind: "event", title: "Fort Open Studios", area: "Fort", source: "Curated demo record", status: "Needs review", detail: "Demo event awaiting an official source", lastChecked: "Not checked" },
  { id: "op-event-stage", kind: "event", title: "Small Stage: Local Stories", area: "Bandra", source: "Public event submission", status: "Needs review", detail: "Community reported event", lastChecked: "Needs confirmation" },
  { id: "op-experience-kharghar", kind: "experience", title: "Kharghar Hills View", area: "Kharghar", source: "Curated demo record", status: "Stale", detail: "Weather and access data needs a check", lastChecked: "Demo data" },
  { id: "op-media-market", kind: "media", title: "Inside the market lanes of Vashi", area: "Vashi", source: "YouTube · Local creator", status: "Needs review", detail: "Match video to the exact market", lastChecked: "Not checked" },
  { id: "op-gem-matunga", kind: "hidden-gem", title: "Matunga Breakfast Trail", area: "Matunga", source: "Resident recommendation", status: "Needs review", detail: "Verify provider and current hours", lastChecked: "Not checked" },
];

export const OPERATIONS_KEY = "ananta-operations";

export function readOperations() {
  if (typeof window === "undefined") return operationSeed;
  try {
    const value = JSON.parse(window.localStorage.getItem(OPERATIONS_KEY) || "null");
    return Array.isArray(value) ? value as OperationRecord[] : operationSeed;
  } catch {
    return operationSeed;
  }
}

export function writeOperations(records: OperationRecord[]) {
  window.localStorage.setItem(OPERATIONS_KEY, JSON.stringify(records));
  window.dispatchEvent(new Event("ananta-operations-change"));
}
