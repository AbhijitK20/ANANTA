import { evaluatePlan } from "@/lib/plan";
import type { Experience } from "@/lib/seed";

export type AvailabilityMap = Record<string, "Open" | "Limited" | "Closed">;

export type AdaptationConstraints = {
  plan: Experience[];
  catalog: Experience[];
  budget: number;
  availableMinutes: number;
  deadline?: string;
  availability: AvailabilityMap;
  rainMode?: boolean;
};

export type AdaptationSuggestion = {
  closed: Experience;
  replacement?: Experience;
  candidatesConsidered: number;
  detail: string;
};

export function closedPlanItems(plan: Experience[], availability: AvailabilityMap) {
  return plan.filter((item) => availability[item.id] === "Closed");
}

/**
 * For every planned experience its provider marked closed, propose the first
 * replacement that keeps the whole plan feasible. Hard constraints are checked
 * with evaluatePlan, so a suggestion can never violate time, budget, or deadline.
 */
export function suggestClosedReplacements(constraints: AdaptationConstraints): AdaptationSuggestion[] {
  const { plan, catalog, budget, availableMinutes, deadline, availability, rainMode } = constraints;
  const suggestions: AdaptationSuggestion[] = [];
  const planIds = new Set(plan.map(({ id }) => id));

  for (const closed of closedPlanItems(plan, availability)) {
    const rest = plan.filter((item) => item.id !== closed.id);
    const candidates = catalog.filter((item) =>
      item.id !== closed.id &&
      !planIds.has(item.id) &&
      availability[item.id] !== "Closed" &&
      !(rainMode && item.statusTone === "amber"),
    );
    const feasible = candidates
      .map((candidate) => ({ candidate, evaluation: evaluatePlan([...rest, candidate], budget, availableMinutes, 15, deadline) }))
      .filter(({ evaluation }) => evaluation.feasible)
      .sort((a, b) =>
        a.evaluation.travelMinutes - b.evaluation.travelMinutes ||
        a.evaluation.totalCost - b.evaluation.totalCost ||
        a.candidate.name.localeCompare(b.candidate.name),
      );

    const replacement = feasible[0]?.candidate;
    suggestions.push({
      closed,
      replacement,
      candidatesConsidered: candidates.length,
      detail: replacement
        ? `Replaces ${closed.name} and keeps the plan inside the listed time and budget.`
        : `No listed alternative keeps the plan feasible. ${candidates.length} option${candidates.length === 1 ? " was" : "s were"} checked against the remaining time and budget.`,
    });
  }
  return suggestions;
}
