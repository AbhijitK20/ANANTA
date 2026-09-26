export type OperationKind = "event" | "experience" | "media" | "hidden-gem" | "submission" | "demand";

export type OperationRecord = {
  id: string;
  kind: OperationKind;
  title: string;
  area: string;
  source: string;
  status: "Needs review" | "Verified" | "Stale" | "Published";
  detail: string;
  lastChecked: string;
  /**
   * For `submission` rows: the provider listing id the publish action acts on.
   * Without it a "Verify" button sets a string nothing in discovery reads, which
   * is what the old admin page did.
   */
  listingId?: string;
  /** For `demand` rows: the demand fingerprint the row is grouped under. */
  fingerprint?: string;
};

export const operationSeed: OperationRecord[] = [
  { id: "op-event-fort", kind: "event", title: "Fort Open Studios", area: "Fort", source: "Curated demo record", status: "Needs review", detail: "Demo event awaiting an official source", lastChecked: "Not checked" },
  { id: "op-event-stage", kind: "event", title: "Small Stage: Local Stories", area: "Bandra", source: "Public event submission", status: "Needs review", detail: "Community reported event", lastChecked: "Needs confirmation" },
  { id: "op-experience-kharghar", kind: "experience", title: "Kharghar Hills View", area: "Kharghar", source: "Curated demo record", status: "Stale", detail: "Weather and access data needs a check", lastChecked: "Demo data" },
  { id: "op-media-market", kind: "media", title: "Inside the market lanes of Vashi", area: "Vashi", source: "YouTube · Local creator", status: "Needs review", detail: "Match video to the exact market", lastChecked: "Not checked" },
  { id: "op-gem-matunga", kind: "hidden-gem", title: "Matunga Breakfast Trail", area: "Matunga", source: "Resident recommendation", status: "Needs review", detail: "Verify provider and current hours", lastChecked: "Not checked" },
];

export const OPERATIONS_KEY = "ananta-operations";

export function readOperations(): OperationRecord[] {
  if (typeof window === "undefined") return operationSeed;
  try {
    const value = JSON.parse(window.localStorage.getItem(OPERATIONS_KEY) || "null");
    return Array.isArray(value) ? (value as OperationRecord[]) : operationSeed;
  } catch {
    return operationSeed;
  }
}

export function writeOperations(records: OperationRecord[]): void {
  window.localStorage.setItem(OPERATIONS_KEY, JSON.stringify(records));
  window.dispatchEvent(new Event("ananta-operations-change"));
}

/** Records an operator still has to act on, oldest first, so nothing hides below a long verified list. */
export function pendingOperations(records: readonly OperationRecord[]): OperationRecord[] {
  return records
    .filter((record) => record.status === "Needs review")
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** The publishable queue: provider submissions an operator has not published. */
export function publishableSubmissions(records: readonly OperationRecord[]): OperationRecord[] {
  return records
    .filter((record) => record.kind === "submission" && record.status !== "Published" && Boolean(record.listingId))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Publish a submission. This is the action whose absence severed the loop: the
 * admin page used to offer only Verify and Mark stale, both of which set a
 * status string nothing in discovery ever read, so an operator could verify a
 * thousand records and not one traveller-facing signal would change.
 *
 * Returns a new array; the caller persists it.
 */
export function publishSubmission(
  records: readonly OperationRecord[],
  id: string,
  now: string,
): OperationRecord[] {
  return records
    .map((record) => (record.id === id ? { ...record, status: "Published" as const, lastChecked: now } : record))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/* ── stale marks ──────────────────────────────────────────────────────────── */

/**
 * "Mark stale" used to set a status string that nothing in discovery ever read,
 * while the tooltip claimed "Remove from ranking until checked". An operator
 * could mark ten thousand records stale and change nothing a traveller sees.
 *
 * This is the store that makes the claim true, plus a pure function that
 * applies it. A stale mark now sets `statusTone: "amber"` on the real record,
 * and `amber` is exactly what the gate and the travel options already treat as
 * weather dependent or season dependent, so a stale record drops out of a
 * rain-sensitive plan and gets an advisory flag on a plan that is not.
 *
 * Wiring it into Explore is one call to `applyStaleMarks` in the page that
 * already imports the catalogue. That call is a blocker for session 9, recorded
 * in `SESSION/BLOCKERS/10.md`, because `app/explore/**` is not ours to edit.
 */
export const STALE_IDS_KEY = "ananta-stale-ids";

export function readStaleIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STALE_IDS_KEY) || "null");
    return Array.isArray(value) ? (value as string[]).filter((id) => typeof id === "string").sort() : [];
  } catch {
    return [];
  }
}

export function writeStaleIds(ids: readonly string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STALE_IDS_KEY, JSON.stringify([...ids].sort()));
  window.dispatchEvent(new Event("ananta-operations-change"));
}

export function setStale(ids: readonly string[], recordId: string, stale: boolean): string[] {
  const next = new Set(ids);
  if (stale) next.add(recordId);
  else next.delete(recordId);
  const sorted = [...next].sort();
  writeStaleIds(sorted);
  return sorted;
}

/**
 * Apply stale marks to a catalogue. Pure, so the claim "stale means removed from
 * ranking" is a test rather than a tooltip.
 */
export function applyStaleMarks<T extends { id: string; status: string; statusTone: "blue" | "green" | "amber" }>(
  records: readonly T[],
  staleIds: readonly string[],
): T[] {
  if (!staleIds.length) return records.slice();
  const stale = new Set(staleIds);
  return records.map((record) =>
    stale.has(record.id)
      ? { ...record, status: "Stale, pending recheck", statusTone: "amber" as const }
      : record,
  );
}
