import { mediaSeed, type MediaSeed } from "@/lib/seed";

export type MediaRecord = MediaSeed & {
  lastChecked: string;
  history: { action: "Approved" | "Rejected" | "Marked stale" | "Archived"; at: string }[];
};

export const MEDIA_STORE_KEY = "ananta-media-records";

/** Seeds the admin media store from the curated demo media set. */
export function mediaSeedRecords(): MediaRecord[] {
  return mediaSeed.map((item) => ({
    ...item,
    lastChecked: item.state === "Approved" ? "Demo data" : "Not checked",
    history: item.state === "Approved" ? [{ action: "Approved" as const, at: "Demo data" }] : [],
  }));
}

export function readMediaRecords(): MediaRecord[] {
  if (typeof window === "undefined") return mediaSeedRecords();
  try {
    const value = JSON.parse(window.localStorage.getItem(MEDIA_STORE_KEY) || "null");
    return Array.isArray(value) && value.every((record) => typeof record?.id === "string") ? (value as MediaRecord[]) : mediaSeedRecords();
  } catch {
    return mediaSeedRecords();
  }
}

export function writeMediaRecords(records: MediaRecord[]) {
  window.localStorage.setItem(MEDIA_STORE_KEY, JSON.stringify(records));
  window.dispatchEvent(new Event("ananta-media-change"));
}

/** Pure: returns the next records; the caller persists with writeMediaRecords. */
export function applyMediaAction(records: MediaRecord[], id: string, action: MediaRecord["history"][number]["action"]): MediaRecord[] {
  return records.map((record) =>
    record.id === id
      ? {
          ...record,
          state: action === "Approved" ? ("Approved" as const) : action === "Marked stale" ? ("Needs review" as const) : ("Archived" as const),
          lastChecked: "Just now",
          history: [...record.history, { action, at: "Just now" }],
        }
      : record,
  );
}

/** Detail-page media resolution must never surface records that are not currently Approved. */
export function approvedMediaIds(records: MediaRecord[]) {
  return new Set(records.filter((record) => record.state === "Approved").map((record) => record.id));
}
