import { describe, expect, it } from "vitest";
import { eventChanges, eventStatus, evaluateEvents } from "@/lib/events";
import { eventSeed } from "@/lib/seed";

const fort = eventSeed.find((event) => event.id === "fort-open-studios")!;
const stage = eventSeed.find((event) => event.id === "bandra-small-stage")!;

describe("event lifecycle", () => {
  it("marks a live window as happening now", () => {
    expect(eventStatus(fort, 60)).toBe("Happening now");
  });

  it("excludes events whose window has passed", () => {
    expect(eventStatus(fort, 300)).toBe("Already ended");
  });

  it("marks events that cannot be reached before start", () => {
    expect(eventStatus(fort, 20)).toBe("Cannot reach in time");
  });

  it("keeps events reachable when travel fits before start", () => {
    expect(eventStatus(stage, 45)).toBe("Starting soon");
  });

  it("splits reachable and excluded events with reasons", () => {
    const result = evaluateEvents([fort, stage], 20);
    expect(result.reachable.some(({ event }) => event.id === "bandra-small-stage")).toBe(true);
    expect(result.excluded.find(({ event }) => event.id === "fort-open-studios")?.status).toBe("Cannot reach in time");
    expect(result.excluded.find(({ event }) => event.id === "fort-open-studios")?.reason).toContain("needs about 18 minutes");
  });
});

describe("event change detection", () => {
  it("flags venue, time, and price changes against the last snapshot", () => {
    const changes = eventChanges(stage);
    expect(changes.map(({ field }) => field)).toEqual(["Venue", "Start time", "Price"]);
    expect(changes.find(({ field }) => field === "Venue")?.from).toContain("community hall");
  });

  it("flags a price change", () => {
    const market = eventSeed.find((event) => event.id === "seawoods-makers-market")!;
    expect(eventChanges(market).map(({ field }) => field)).toEqual(["Price"]);
  });

  it("returns no changes for events without a snapshot", () => {
    expect(eventChanges(fort)).toEqual([]);
  });
});
