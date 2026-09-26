export type ProviderAlert = {
  id: string;
  listingId: string;
  severity: "info" | "attention";
  title: string;
  detail: string;
};

export type AlertContext = {
  /** listingId -> ISO date string of the listing's last update */
  updated: Record<string, string>;
  /** listingId -> current availability */
  availability: Record<string, "Open" | "Limited" | "Closed">;
  /**
   * listingId -> how many times the gate refused this listing, read from the
   * persisted rejection stream in `lib/provider.ts`. A real count. It is never
   * floored, and the old page's `Math.max(counts[id], 4)` that manufactured
   * demand to trip this very threshold is gone.
   */
  refusals?: Record<string, number>;
  /** listingId -> the named fact that killed it most often. */
  topRejection?: Record<string, string>;
  /** listingId -> seats a provider published and nobody booked. */
  unusedSlots?: Record<string, number>;
  /**
   * The date "how stale is this" is measured against. Required, not defaulted.
   * The old default was a frozen literal, which made every freshness alert
   * decorative: the numbers moved but the comparison never did.
   */
  today: string;
};

/**
 * Derives provider alerts from recorded signals only. Every alert cites the
 * signal it came from, so nothing is fabricated.
 *
 * The ordering is cheapest-signal-first so a real fact always outranks a
 * heuristic: an actual closure outranks a staleness threshold, and an actual
 * refusal with a named reason outranks a raw count.
 */
export function providerAlerts(context: AlertContext): ProviderAlert[] {
  const alerts: ProviderAlert[] = [];
  const today = context.today;
  if (!today) throw new Error("providerAlerts needs `today`. A frozen date makes the freshness alerts decorative.");

  for (const listingId of Object.keys(context.updated).sort()) {
    const updated = context.updated[listingId];
    if (typeof updated !== "string" || !updated) continue;
    const name = listingLabel(listingId);
    const availability = context.availability[listingId];

    if (availability === "Closed") {
      alerts.push({
        id: `alert-closed-${listingId}`,
        listingId,
        severity: "attention",
        title: "Removed from discovery",
        detail: `${name} is marked Closed and is currently excluded from recommendations.`,
      });
    } else if (availability === "Limited") {
      alerts.push({
        id: `alert-limited-${listingId}`,
        listingId,
        severity: "info",
        title: "Marked as limited availability",
        detail: `${name} is marked Limited. Travelers still see it with a limited-availability note.`,
      });
    }

    const refusals = context.refusals?.[listingId] ?? 0;
    const reason = context.topRejection?.[listingId];
    if (refusals > 0) {
      alerts.push({
        id: `alert-demand-${listingId}`,
        listingId,
        severity: "info",
        title: refusals === 1 ? "One traveler could not book this" : `${refusals} travelers could not book this`,
        detail: reason
          ? `${name} was refused ${refusals} time${refusals === 1 ? "" : "s"}. Most often: ${reason}`
          : `${name} was refused ${refusals} time${refusals === 1 ? "" : "s"} by the feasibility gate.`,
      });
    }

    const unused = context.unusedSlots?.[listingId];
    if (unused !== undefined && unused >= 3) {
      alerts.push({
        id: `alert-slots-${listingId}`,
        listingId,
        severity: "info",
        title: "Unused slots tomorrow",
        detail: `${name} has ${unused} unused slots published for tomorrow.`,
      });
    }

    const ageDays = updatedAgeDays(updated, today);
    if (ageDays >= 14) {
      alerts.push({
        id: `alert-stale-${listingId}`,
        listingId,
        severity: "attention",
        title: "Listing details look stale",
        detail: `${name} has not been updated in ${ageDays} days. Stale listings rank lower until details are reconfirmed.`,
      });
    } else if (ageDays >= 7) {
      alerts.push({
        id: `alert-refresh-${listingId}`,
        listingId,
        severity: "info",
        title: "Time to refresh details",
        detail: `${name} was last updated ${ageDays} days ago.`,
      });
    }
  }
  return alerts;
}

function listingLabel(listingId: string): string {
  return listingId.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function updatedAgeDays(updated: string, today: string): number {
  const updatedDate = new Date(updated);
  if (Number.isNaN(updatedDate.getTime())) return 0;
  return Math.max(0, Math.round((new Date(today).getTime() - updatedDate.getTime()) / 86_400_000));
}
