import { describe, expect, it } from "vitest";
import { providerAlerts } from "@/lib/alerts";

const TODAY = "2026-09-26";

describe("providerAlerts", () => {
  it("flags stale listings with the age stated", () => {
    const alerts = providerAlerts({
      updated: { "matunga-breakfast-trail": "2026-08-18" },
      availability: {},
      today: TODAY,
    });
    const stale = alerts.find(({ id }) => id === "alert-stale-matunga-breakfast-trail");
    expect(stale).toBeTruthy();
    expect(stale?.detail).toContain("39 days");
  });

  it("reports a real refusal count and names the constraint that caused it", () => {
    const alerts = providerAlerts({
      updated: { "vashi-market-loop": "2026-09-25" },
      availability: {},
      refusals: { "vashi-market-loop": 4 },
      topRejection: { "vashi-market-loop": "Closed for part of the visit window, 42 min short." },
      today: TODAY,
    });
    const demand = alerts.find(({ id }) => id === "alert-demand-vashi-market-loop");
    expect(demand?.title).toBe("4 travelers could not book this");
    expect(demand?.detail).toContain("42 min short");
  });

  it("says one, not travellers, when only one was refused", () => {
    const alerts = providerAlerts({
      updated: { "vashi-market-loop": "2026-09-25" },
      availability: {},
      refusals: { "vashi-market-loop": 1 },
      today: TODAY,
    });
    expect(alerts.find(({ id }) => id === "alert-demand-vashi-market-loop")?.title).toBe(
      "One traveler could not book this",
    );
  });

  it("warns when a listing is closed and excluded from recommendations", () => {
    const alerts = providerAlerts({
      updated: { "matunga-breakfast-trail": "2026-09-25" },
      availability: { "matunga-breakfast-trail": "Closed" },
      today: TODAY,
    });
    expect(
      alerts.some(({ severity, title }) => severity === "attention" && title === "Removed from discovery"),
    ).toBe(true);
  });

  it("reports unused slots when published", () => {
    const alerts = providerAlerts({
      updated: { "hill-road-cafe-crawl": "2026-09-25" },
      availability: {},
      unusedSlots: { "hill-road-cafe-crawl": 5 },
      today: TODAY,
    });
    expect(alerts.some(({ detail }) => detail.includes("5 unused slots"))).toBe(true);
  });

  it("stays silent when there is nothing honest to report", () => {
    const alerts = providerAlerts({
      updated: { "vashi-market-loop": "2026-09-25" },
      availability: { "vashi-market-loop": "Open" },
      today: TODAY,
    });
    expect(alerts).toEqual([]);
  });

  it("refuses to guess today rather than defaulting to a frozen date", () => {
    expect(() =>
      providerAlerts({
        updated: { "vashi-market-loop": "2026-01-01" },
        availability: {},
        today: undefined as unknown as string,
      }),
    ).toThrow(/needs `today`/);
  });
});
