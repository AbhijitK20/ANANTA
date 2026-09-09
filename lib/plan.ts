import type { Experience } from "@/lib/seed";

export const PLAN_STORAGE_KEY = "ananta-draft-plan";

export function readPlan(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(PLAN_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function writePlan(ids: string[]) {
  window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(Array.from(new Set(ids))));
  window.dispatchEvent(new Event("ananta-plan-change"));
}

export function getPlannedExperiences(ids: string[], experiences: Experience[]) {
  return ids.map((id) => experiences.find((experience) => experience.id === id)).filter((experience): experience is Experience => Boolean(experience));
}

export function parseDurationMinutes(value: string) {
  const hours = value.match(/([0-9.]+)\s*hour/);
  const minutes = value.match(/([0-9]+)\s*min/);
  return (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
}

export function parsePrice(value: string) {
  return value === "Free" ? 0 : Number(value.replace(/[^0-9]/g, ""));
}

export function parseTravelMinutes(value: string) {
  const minutes = value.match(/([0-9]+)\s*min/);
  return minutes ? Number(minutes[1]) : 0;
}

export function evaluatePlan(experiences: Experience[], budget: number, availableMinutes: number, bufferMinutes = 15, deadline?: string) {
  const activityMinutes = experiences.reduce((sum, experience) => sum + parseDurationMinutes(experience.duration), 0);
  const travelMinutes = experiences.reduce((sum, experience) => sum + parseTravelMinutes(experience.travelTime), 0);
  const totalMinutes = activityMinutes + travelMinutes + (experiences.length ? bufferMinutes : 0);
  const totalCost = experiences.reduce((sum, experience) => sum + parsePrice(experience.price), 0);
  const hasWeatherWarning = experiences.some((experience) => experience.statusTone === "amber");
  const budgetFits = totalCost <= budget;
  const timeFits = totalMinutes <= availableMinutes;
  const deadlineMinutes = deadline ? minutesUntil(deadline) : undefined;
  const deadlineFits = deadlineMinutes === undefined || totalMinutes <= deadlineMinutes;
  return {
    activityMinutes,
    travelMinutes,
    bufferMinutes: experiences.length ? bufferMinutes : 0,
    totalMinutes,
    totalCost,
    budgetFits,
    timeFits,
    hasWeatherWarning,
    deadlineMinutes,
    deadlineFits,
    feasible: budgetFits && timeFits && deadlineFits,
  };
}

export type PlanVariant = {
  id: "lowest-cost" | "shortest-access";
  label: string;
  description: string;
  experiences: Experience[];
  evaluation: ReturnType<typeof evaluatePlan>;
};

export function generatePlanVariants(current: Experience[], candidates: Experience[], budget: number, availableMinutes: number, deadline?: string) {
  if (!current.length) return [] as PlanVariant[];
  const combinations = choose(candidates, current.length)
    .map((experiences) => ({ experiences, evaluation: evaluatePlan(experiences, budget, availableMinutes, 15, deadline) }))
    .filter(({ evaluation }) => evaluation.feasible);
  if (!combinations.length) return [] as PlanVariant[];

  const lowestCost = [...combinations].sort((a, b) => a.evaluation.totalCost - b.evaluation.totalCost || a.evaluation.totalMinutes - b.evaluation.totalMinutes)[0];
  const shortestAccess = [...combinations].sort((a, b) => a.evaluation.travelMinutes - b.evaluation.travelMinutes || a.evaluation.totalCost - b.evaluation.totalCost)[0];
  const variants: PlanVariant[] = [
    { id: "lowest-cost", label: "Lowest listed cost", description: "Uses the lowest listed experience prices among feasible combinations.", ...lowestCost },
    { id: "shortest-access", label: "Shortest listed access estimate", description: "Uses the smallest combined access-time estimates among feasible combinations.", ...shortestAccess },
  ];
  return variants.filter((variant, index) => variants.findIndex((item) => samePlan(item.experiences, variant.experiences)) === index);
}

function choose(items: Experience[], size: number, start = 0, selected: Experience[] = []): Experience[][] {
  if (selected.length === size) return [selected];
  const results: Experience[][] = [];
  for (let index = start; index <= items.length - (size - selected.length); index += 1) {
    results.push(...choose(items, size, index + 1, [...selected, items[index]]));
  }
  return results;
}

function samePlan(first: Experience[], second: Experience[]) {
  return first.map(({ id }) => id).sort().join(",") === second.map(({ id }) => id).sort().join(",");
}

function minutesUntil(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const now = new Date();
  const deadline = new Date(now);
  deadline.setHours(hours, minutes, 0, 0);
  if (deadline <= now) deadline.setDate(deadline.getDate() + 1);
  return Math.round((deadline.getTime() - now.getTime()) / 60000);
}
