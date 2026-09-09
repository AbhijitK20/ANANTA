import { parseDurationMinutes, parsePrice, parseTravelMinutes } from "@/lib/plan";
import type { Experience } from "@/lib/seed";

export type RecommendationConstraints = {
  query?: string;
  intentApplied?: boolean;
  city?: "All" | "Mumbai" | "Navi Mumbai";
  category?: string;
  maxPrice?: number;
  availableMinutes?: number;
  rainMode?: boolean;
  availability?: Record<string, "Open" | "Limited" | "Closed">;
};

export type RankedExperience = {
  experience: Experience;
  score: number;
  reasons: string[];
};

export type ExcludedExperience = {
  experience: Experience;
  reasons: string[];
};

export function recommendExperiences(experiences: Experience[], constraints: RecommendationConstraints) {
  const ranked: RankedExperience[] = [];
  const excluded: ExcludedExperience[] = [];
  const normalizedQuery = constraints.query?.trim().toLowerCase() || "";

  for (const experience of experiences) {
    const hardFailures: string[] = [];
    const searchable = `${experience.name} ${experience.area} ${experience.city} ${experience.category}`.toLowerCase();
    const totalMinutes = parseDurationMinutes(experience.duration) + parseTravelMinutes(experience.travelTime) + 15;
    const price = parsePrice(experience.price);

    if (normalizedQuery && !constraints.intentApplied && !searchable.includes(normalizedQuery)) hardFailures.push("Does not match the search text");
    if (constraints.city && constraints.city !== "All" && experience.city !== constraints.city) hardFailures.push(`Outside ${constraints.city}`);
    if (constraints.category && constraints.category !== "All" && experience.category !== constraints.category) hardFailures.push(`Not in ${constraints.category}`);
    if (constraints.maxPrice !== undefined && price > constraints.maxPrice) hardFailures.push(`Above ₹${constraints.maxPrice.toLocaleString("en-IN")}`);
    if (constraints.availableMinutes !== undefined && totalMinutes > constraints.availableMinutes) hardFailures.push(`Needs about ${totalMinutes} minutes including travel and buffer`);
    if (constraints.rainMode && experience.statusTone === "amber") hardFailures.push("Weather dependent");
    if (constraints.availability?.[experience.id] === "Closed") hardFailures.push("Provider marked this experience closed");

    if (hardFailures.length) {
      excluded.push({ experience, reasons: hardFailures });
      continue;
    }

    let score = 0;
    const reasons: string[] = [];
    if (constraints.city && constraints.city !== "All" && experience.city === constraints.city) { score += 3; reasons.push(`In ${constraints.city}`); }
    if (constraints.category && constraints.category !== "All" && experience.category === constraints.category) { score += 4; reasons.push(`Matches ${constraints.category.toLowerCase()}`); }
    if (constraints.maxPrice !== undefined) { score += Math.max(1, 3 - price / Math.max(constraints.maxPrice, 1)); reasons.push(`Within ₹${constraints.maxPrice.toLocaleString("en-IN")}`); }
    if (constraints.availableMinutes !== undefined) { score += Math.max(1, 3 - totalMinutes / Math.max(constraints.availableMinutes, 1)); reasons.push(`Fits about ${constraints.availableMinutes} minutes`); }
    if (constraints.rainMode && experience.statusTone !== "amber") { score += 2; reasons.push("Not marked weather dependent"); }
    if (constraints.availability?.[experience.id] === "Open") { score += 2; reasons.push("Provider marked open"); }
    if (constraints.availability?.[experience.id] === "Limited") reasons.push("Limited availability");
    if (normalizedQuery && searchable.includes(normalizedQuery)) { score += 3; reasons.push("Matches search text"); }
    if (!reasons.length) reasons.push("Available in the curated demo set");
    ranked.push({ experience, score, reasons });
  }

  ranked.sort((a, b) => b.score - a.score || a.experience.name.localeCompare(b.experience.name));
  return { ranked, excluded };
}
