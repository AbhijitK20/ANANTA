import { describe, expect, it } from "vitest";
import { providerAlerts } from "@/lib/alerts";

describe("providerAlerts", () => {
  it("flags stale listings with the age stated", () => {
    const alerts = providerAlerts({ updated: { "matunga-breakfast-trail": "2026-08-01" }, availability: {}, saves: {}, today: "2026-09-09" });
    expect(alerts.some(({ id }) => id === "alert-stale-matunga-breakfast-trail")).toBe(true);
    expect(alerts[0].detail).toContain("39 days");
  });

  it("celebrates high saved interest and cites the demo signal", () => {
    const alerts = providerAlerts({ updated: { "vashi-market-loop": "2026-09-08" }, availability: {}, saves: { "vashi-market-loop": 4 }, today: "2026-09-09" });
    expect(alerts.some(({ detail }) => detail.includes("saved 4 times"))).toBe(true);
  });

  it("warns when a listing is closed and excluded from recommendations", () => {
    const alerts = providerAlerts({ updated: { "matunga-breakfast-trail": "2026-09-08" }, availability: { "matunga-breakfast-trail": "Closed" }, saves: {}, today: "2026-09-09" });
    expect(alerts.some(({ severity, title }) => severity === "attention" && title === "Removed from discovery")).toBe(true);
  });

  it("reports unused slots when published", () => {
    const alerts = providerAlerts({ updated: { "hill-road-cafe-crawl": "2026-09-08" }, availability: {}, saves: {}, unusedSlots: { "hill-road-cafe-crawl": 5 }, today: "2026-09-09" });
    expect(alerts.some(({ detail }) => detail.includes("5 unused slots"))).toBe(true);
  });

  it("stays silent when there is nothing honest to report", () => {
    const alerts = providerAlerts({ updated: { "vashi-market-loop": "2026-09-08" }, availability: { "vashi-market-loop": "Open" }, saves: {}, today: "2026-09-09" });
    expect(alerts).toEqual([]);
  });
});
