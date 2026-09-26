import type { ComponentId, Objective } from "@/lib/engine/contracts/types";

/**
 * The one tolerance. Session 10's eval harness imports this from here rather
 * than writing a second literal, so "the bound" has exactly one definition in
 * the repository.
 */
export const DRIFT_TOLERANCE = 1e-6;

export type DriftRowId = ComponentId | "aggregate";

export interface DriftRow {
  id: DriftRowId;
  fast: number;
  naive: number;
  delta: number;
}

export interface DriftComparison {
  /** |objectiveFast.value - objectiveNaive.value|. */
  drift: number;
  /** Worst divergence first, so the failure message leads with the culprit. */
  perComponent: DriftRow[];
}

const COMPONENT_ORDER: readonly ComponentId[] = [
  "interest",
  "rating",
  "value",
  "authenticity",
  "weather",
  "crowd",
  "novelty",
  "groupFit",
  "travelFriction",
  "reliability",
];

function contributions(
  objective: Objective,
): Record<string, number> {
  const table: Record<string, number> = {};
  for (const item of objective.breakdown.components) {
    table[item.id] = (table[item.id] ?? 0) + item.contribution;
  }
  return table;
}

/**
 * Compare two derivations of the same scalar.
 *
 * `aggregate` is the scalar itself. `perComponent` holds one row per component
 * either side reported, so a component that exists on only one side is still
 * visible rather than silently dropped. Rows are sorted by descending absolute
 * delta, then by a fixed component order, so the ordering is deterministic.
 */
export function compareDrift(fast: Objective, naive: Objective): DriftComparison {
  const drift = Math.abs(fast.value - naive.value);
  const fastParts = contributions(fast);
  const naiveParts = contributions(naive);

  const ids: string[] = [];
  for (const id of COMPONENT_ORDER) {
    if (id in fastParts || id in naiveParts) ids.push(id);
  }
  for (const id of Object.keys(fastParts).sort()) {
    if (ids.indexOf(id) === -1) ids.push(id);
  }
  for (const id of Object.keys(naiveParts).sort()) {
    if (ids.indexOf(id) === -1) ids.push(id);
  }

  const rows: DriftRow[] = ids.map((id) => {
    const a = fastParts[id] ?? 0;
    const b = naiveParts[id] ?? 0;
    return { id: id as DriftRowId, fast: a, naive: b, delta: a - b };
  });
  rows.push({
    id: "aggregate",
    fast: fast.value,
    naive: naive.value,
    delta: fast.value - naive.value,
  });

  rows.sort((left, right) => {
    const byMagnitude = Math.abs(right.delta) - Math.abs(left.delta);
    if (byMagnitude !== 0) return byMagnitude;
    return rank(left.id) - rank(right.id);
  });

  return { drift, perComponent: rows };
}

function rank(id: DriftRowId): number {
  if (id === "aggregate") return COMPONENT_ORDER.length;
  const index = COMPONENT_ORDER.indexOf(id);
  return index === -1 ? COMPONENT_ORDER.length : index;
}

export function withinTolerance(comparison: DriftComparison): boolean {
  return comparison.drift <= DRIFT_TOLERANCE;
}

/**
 * The failure message. A drift test that only reports two totals costs the team
 * an hour per occurrence, so this names the rows, worst first.
 */
export function describeDrift(comparison: DriftComparison): string {
  const worst = comparison.perComponent.filter(
    (row) => row.id !== "aggregate" && Math.abs(row.delta) > DRIFT_TOLERANCE,
  );
  const head = `drift ${comparison.drift.toExponential(3)} over tolerance ${DRIFT_TOLERANCE.toExponential(1)}`;
  if (worst.length === 0) return head;
  const detail = worst
    .slice(0, 5)
    .map(
      (row) =>
        `${row.id}: fast ${row.fast} vs naive ${row.naive} (delta ${row.delta.toExponential(3)})`,
    )
    .join("; ");
  return `${head}. Worst components: ${detail}`;
}
