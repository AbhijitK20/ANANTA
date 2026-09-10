import { describe, expect, it } from "vitest";
import { allExperiences, allMedia, DATASET_CATEGORIES } from "@/lib/data";
import { approvedMediaFor } from "@/lib/media";
import { generatedVideos } from "@/lib/data/videos.generated";
import { generatedImages } from "@/lib/data/images.generated";
import { zoneRows } from "@/lib/data/zones";

describe("expanded dataset", () => {
  it("has at least 100 records in every traveler category", () => {
    for (const category of DATASET_CATEGORIES) {
      const count = allExperiences.filter((experience) => experience.category === category).length;
      expect(count, category).toBeGreaterThanOrEqual(100);
    }
  });

  it("has more than 900 total records", () => {
    expect(allExperiences.length).toBeGreaterThan(900);
  });

  it("has unique ids across the merged dataset", () => {
    const ids = allExperiences.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every record inside the Mumbai metro bounding box", () => {
    for (const experience of allExperiences) {
      const [lng, lat] = experience.coordinates;
      expect(lng, experience.id).toBeGreaterThan(72.7);
      expect(lng, experience.id).toBeLessThan(73.3);
      expect(lat, experience.id).toBeGreaterThan(18.8);
      expect(lat, experience.id).toBeLessThan(19.35);
    }
  });

  it("places geocoded records within 3.5 km of their area anchor", () => {
    const zoneByArea = new Map(zoneRows.map((zone) => [zone.area, zone]));
    let geocoded = 0;
    for (const experience of allExperiences) {
      if (!experience.confidence.startsWith("Location matched on OpenStreetMap")) continue;
      geocoded += 1;
      const anchor = zoneByArea.get(experience.area)?.coordinates;
      expect(anchor, experience.id).toBeTruthy();
      const dLng = (experience.coordinates[0] - anchor![0]) * 111.32 * Math.cos((experience.coordinates[1] * Math.PI) / 180);
      const dLat = (experience.coordinates[1] - anchor![1]) * 110.57;
      const km = Math.sqrt(dLng * dLng + dLat * dLat);
      expect(km, `${experience.id} sits ${km.toFixed(2)} km from its ${experience.area} anchor`).toBeLessThanOrEqual(3.5);
    }
    expect(geocoded).toBeGreaterThan(400);
  });

  it("pins the Kharghar hills experiences on the hills, not at the station anchor", () => {
    const anchor: [number, number] = [73.0679, 19.0469]; // Kharghar station area
    for (const id of ["kharghar-hills-trek", "kharghar-hills-sunrise-hike", "kharghar-waterfall-monsoon-hike"]) {
      const experience = allExperiences.find((record) => record.id === id);
      expect(experience, id).toBeTruthy();
      const dLng = (experience!.coordinates[0] - anchor[0]) * 111.32 * Math.cos((experience!.coordinates[1] * Math.PI) / 180);
      const dLat = (experience!.coordinates[1] - anchor[1]) * 110.57;
      const km = Math.sqrt(dLng * dLng + dLat * dLat);
      expect(km, `${id} must sit away from the station anchor`).toBeGreaterThan(0.8);
    }
  });

  it("gives every experience exactly one approved, embeddable video", () => {
    const byExperience = new Map<string, number>();
    for (const item of allMedia) {
      if (item.state !== "Approved") continue;
      byExperience.set(item.experienceId, (byExperience.get(item.experienceId) ?? 0) + 1);
    }
    for (const experience of allExperiences) {
      const count = byExperience.get(experience.id) ?? 0;
      expect(count, experience.id).toBe(1);
    }
    // Every media record must resolve to a real embeddable YouTube upload form.
    for (const item of allMedia) {
      if (item.state !== "Approved" || item.platform !== "youtube") continue;
      expect(item.url, item.id).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/);
    }
  });

  it("draws every image from a non-empty verified Commons pool", () => {
    expect(generatedImages.length).toBeGreaterThan(0);
    for (const experience of allExperiences) {
      expect(experience.imageUrl, experience.id).toContain("commons.wikimedia.org");
      expect(experience.imageCredit, experience.id).toBeTruthy();
    }
  });

  it("never gives two places in the same area the same video", () => {
    for (const media of allMedia) {
      if (media.state !== "Approved" || media.platform !== "youtube") continue;
      expect(media.url, media.id).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/);
    }
    const seen = new Map<string, Map<string, string>>(); // area -> video id -> place id
    for (const experience of allExperiences) {
      const media = approvedMediaFor(experience.id, allMedia);
      expect(media, experience.id).toHaveLength(1);
      if (media[0].media.platform !== "youtube") continue; // e.g. hand-written Instagram reels
      const videoId = /v=([\w-]{11})/.exec(media[0].media.url)?.[1];
      expect(videoId, experience.id).toBeTruthy();
      const byVideo = seen.get(experience.area) ?? new Map<string, string>();
      seen.set(experience.area, byVideo);
      const conflict = byVideo.get(videoId as string);
      expect(conflict, `${experience.id} shares its video with ${conflict} (both in ${experience.area})`).toBeUndefined();
      byVideo.set(videoId as string, experience.id);
    }
  });

  it("keeps the video pool large enough to cover the dataset with mostly distinct slots", () => {
    expect(generatedVideos.length).toBeGreaterThan(50);
  });

  it("resolves approved media for a sample of detail pages", () => {
    const samples = allExperiences.slice(0, 5).concat(allExperiences.slice(-5));
    for (const experience of samples) {
      const media = approvedMediaFor(experience.id, allMedia);
      expect(media, experience.id).toHaveLength(1);
      expect(media[0].embeddable, experience.id).toBe(true);
    }
  });
});
