export const SAVED_KEY = "local-tourist-saved-experiences";

export function readSaved() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const value = JSON.parse(window.localStorage.getItem(SAVED_KEY) || "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [] as string[];
  }
}

export function writeSaved(ids: string[]) {
  window.localStorage.setItem(SAVED_KEY, JSON.stringify(Array.from(new Set(ids))));
  window.dispatchEvent(new Event("local-tourist-saved-change"));
}
