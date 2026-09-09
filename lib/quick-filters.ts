import { estimateFromUser } from "@/lib/location";
import type { Experience } from "@/lib/seed";

export type QuickFilters = {
  hiddenGems?: boolean;
  walkable?: boolean;
  free?: boolean;
  bestTime?: string;
};

export type QuickFilterExclusion = {
  experience: Experience;
  reasons: string[];
};

export const FREE_FILTER_LABEL = "Free entry";
export const WALKABLE_FILTER_LABEL = "Walkable from me";
export const GEMS_FILTER_LABEL = "Hidden gems";
export const BEST_TIME_OPTIONS = ["Any time", "Best in the morning", "Best in daylight", "Best after sunset", "Best after dark", "Best around high tide", "Best in monsoon"] as const;

/** Resident- or community-sourced records are the prototype's gem candidates. */
export function isHiddenGem(experience: Experience): boolean {
  return experience.source.startsWith("Resident recommendation") || experience.source === "Community submission";
}

const WALKABLE_MINUTES = 30;

/**
 * Pure quick-filter pass. Nothing here guesses: exclusions cite the exact rule
 * and the measured value, and the caller is expected to surface them.
 */
export function applyQuickFilters(
  experiences: Experience[],
  filters: QuickFilters,
): { kept: Experience[]; excluded: QuickFilterExclusion[] } {
  const kept: Experience[] = [];
  const excluded: QuickFilterExclusion[] = [];

  for (const experience of experiences) {
    const reasons: string[] = [];

    if (filters.hiddenGems && !isHiddenGem(experience)) {
      reasons.push("Not flagged as a hidden gem (no resident or community source)");
    }
    if (filters.walkable) {
      const estimate = estimateFromUser(experience.coordinates);
      if (estimate.walkMinutes > WALKABLE_MINUTES) {
        reasons.push(`About ${estimate.walkMinutes} min walk from your location (over the ${WALKABLE_MINUTES} min walk limit)`);
      }
    }
    if (filters.free && experience.price !== "Free") {
      reasons.push(`Listed price is ${experience.price}, not free`);
    }
    if (filters.bestTime && filters.bestTime !== "Any time" && experience.bestTime !== filters.bestTime) {
      reasons.push(experience.bestTime ? `Best time is listed as ${experience.bestTime}` : "No best-time guidance recorded for this place");
    }

    if (reasons.length) {
      excluded.push({ experience, reasons });
    } else {
      kept.push(experience);
    }
  }

  return { kept, excluded };
}
