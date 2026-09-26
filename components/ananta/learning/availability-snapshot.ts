import type { ExperienceV2 } from "@/lib/engine";

/**
 * Has anything about a saved place changed since the traveller saved it?
 *
 * This is the most useful thing a personal list can say, and it is only
 * possible if something recorded what the availability facts looked like at the
 * moment of saving. So the snapshot is taken when the item is saved, held under
 * this screen's own key, and compared on the way back in.
 *
 * What is compared is exactly what the frozen contract defines on
 * `Availability`: `soldOutAt`, `remainingCapacity`, `leadTimeMinutes` and
 * `updatedAt`. Nothing is re-derived and no provider feed is invented. A record
 * whose provider has never sent a feed reports "no provider feed on file", which
 * is a different sentence from "nothing changed", and the panel keeps them
 * apart.
 */

const SNAPSHOT_KEY = "ananta-saved-availability";

export type AvailabilitySnapshot = {
  /** The record's `availability.updatedAt` when it was saved. */
  updatedAt: string;
  /** ISO sold-out slot, or null. */
  soldOutAt: string | null;
  /** Remaining seats for the party, or null when unknown. */
  remainingCapacity: number | null;
};

type SnapshotStore = Record<string, AvailabilitySnapshot>;

function readStore(): SnapshotStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: SnapshotStore = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as Partial<AvailabilitySnapshot>;
      // A snapshot missing its timestamp is from an older shape and cannot be
      // compared, so it is dropped rather than trusted.
      if (typeof entry.updatedAt !== "string") continue;
      out[id] = {
        updatedAt: entry.updatedAt,
        soldOutAt: typeof entry.soldOutAt === "string" ? entry.soldOutAt : null,
        remainingCapacity:
          typeof entry.remainingCapacity === "number" ? entry.remainingCapacity : null,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(store: SnapshotStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(store));
  } catch {
    /* A blocked or full store must not break the list. */
  }
}

/** Record the current availability for ids that have no snapshot yet. */
export function rememberAvailability(records: ExperienceV2[]) {
  const store = readStore();
  let changed = false;
  for (const record of records) {
    if (store[record.id]) continue;
    store[record.id] = {
      updatedAt: record.availability.updatedAt,
      soldOutAt: record.availability.soldOutAt,
      remainingCapacity: record.availability.remainingCapacity,
    };
    changed = true;
  }
  if (changed) writeStore(store);
}

/** Forget snapshots for ids that are no longer on the list. */
export function forgetAvailability(records: ExperienceV2[]) {
  const store = readStore();
  const live = new Set(records.map((record) => record.id));
  let changed = false;
  for (const id of Object.keys(store)) {
    if (live.has(id)) continue;
    delete store[id];
    changed = true;
  }
  if (changed) writeStore(store);
}

export type AvailabilityChange = {
  id: string;
  kind: "sold-out" | "reopened" | "capacity" | "unchanged" | "no-snapshot" | "no-feed";
  /** The record's own `availability.updatedAt`, which is the fact's timestamp. */
  timestamp: string;
  sentence: string;
};

/** One record, compared against the snapshot taken when it was saved. */
export function availabilityChange(record: ExperienceV2, now: string): AvailabilityChange {
  const snapshot = readStore()[record.id];
  const updatedAt = record.availability.updatedAt;
  if (!snapshot) {
    return {
      id: record.id,
      kind: "no-snapshot",
      timestamp: updatedAt,
      sentence: `Saved on this device. The availability facts on record were last checked ${updatedAt}.`,
    };
  }
  if (record.availability.soldOutAt !== snapshot.soldOutAt) {
    const soldOut = record.availability.soldOutAt !== null;
    return {
      id: record.id,
      kind: soldOut ? "sold-out" : "reopened",
      timestamp: updatedAt,
      sentence: soldOut
        ? `Availability changed since you saved this: the slot is now sold out, marked at ${record.availability.soldOutAt}.`
        : `Availability changed since you saved this: a slot is open again, as of ${updatedAt}.`,
    };
  }
  if (
    record.availability.remainingCapacity !== null &&
    snapshot.remainingCapacity !== null &&
    record.availability.remainingCapacity !== snapshot.remainingCapacity
  ) {
    return {
      id: record.id,
      kind: "capacity",
      timestamp: updatedAt,
      sentence: `Availability changed since you saved this: ${record.availability.remainingCapacity} of your party size is left, marked at ${updatedAt}. It was ${snapshot.remainingCapacity} when you saved it.`,
    };
  }
  if (updatedAt > snapshot.updatedAt) {
    return {
      id: record.id,
      kind: "unchanged",
      timestamp: updatedAt,
      sentence: `Nothing has changed since you saved this. The availability facts were re-checked at ${updatedAt}.`,
    };
  }
  if (record.availability.bookingUrl === null && record.availability.remainingCapacity === null) {
    return {
      id: record.id,
      kind: "no-feed",
      timestamp: updatedAt,
      sentence: `No provider feed exists for this place, so nobody can tell you whether it is free. The record was last checked ${updatedAt}, and a saved list is not a reservation.`,
    };
  }
  return {
    id: record.id,
    kind: "unchanged",
    timestamp: updatedAt,
    sentence: `Nothing has changed since you saved this, as of ${updatedAt}. A saved list is not a reservation.`,
  };
}

/** Drop every snapshot. Used by the profile clear control. */
export const AVAILABILITY_SNAPSHOT_KEY = SNAPSHOT_KEY;
