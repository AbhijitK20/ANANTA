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
  /** number of travelers who saved the listing in the demo window */
  saves: Record<string, number>;
  /** number of open slots the provider published for tomorrow */
  unusedSlots?: Record<string, number>;
  today?: string;
};

/**
 * Derives provider alerts from recorded demo signals only. Every alert cites the
 * signal it came from, so nothing is fabricated.
 */
export function providerAlerts(context: AlertContext): ProviderAlert[] {
  const alerts: ProviderAlert[] = [];
  const today = context.today ?? "2026-09-09";

  for (const [listingId, updated] of Object.entries(context.updated)) {
    const ageDays = updatedAgeDays(updated, today);
    const name = listingLabel(listingId);
    if (ageDays >= 14) {
      alerts.push({ id: `alert-stale-${listingId}`, listingId, severity: "attention", title: `Listing details look stale`, detail: `${name} has not been updated in ${ageDays} days. Stale listings rank lower until details are reconfirmed.` });
    }
    if (ageDays >= 7 && ageDays < 14) {
      alerts.push({ id: `alert-refresh-${listingId}`, listingId, severity: "info", title: `Time to refresh details`, detail: `${name} was last updated ${ageDays} days ago.` });
    }
    if (context.availability[listingId] === "Limited") {
      alerts.push({ id: `alert-limited-${listingId}`, listingId, severity: "info", title: `Marked as limited availability`, detail: `${name} is marked Limited. Travelers still see it with a limited-availability note.` });
    }
    if (context.availability[listingId] === "Closed") {
      alerts.push({ id: `alert-closed-${listingId}`, listingId, severity: "attention", title: `Removed from discovery`, detail: `${name} is marked Closed and is currently excluded from recommendations.` });
    }
    const saves = context.saves[listingId] ?? 0;
    if (saves >= 3) {
      alerts.push({ id: `alert-demand-${listingId}`, listingId, severity: "info", title: `High interest in your listing`, detail: `${name} was saved ${saves} times in the demo window.` });
    }
    const unused = context.unusedSlots?.[listingId];
    if (unused !== undefined && unused >= 3) {
      alerts.push({ id: `alert-slots-${listingId}`, listingId, severity: "info", title: `Unused slots tomorrow`, detail: `${name} has ${unused} unused slots published for tomorrow.` });
    }
  }
  return alerts;
}

function listingLabel(listingId: string) {
  return listingId.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function updatedAgeDays(updated: string, today: string): number {
  const updatedDate = new Date(updated);
  if (Number.isNaN(updatedDate.getTime())) return 0;
  return Math.max(0, Math.round((new Date(today).getTime() - updatedDate.getTime()) / 86_400_000));
}
