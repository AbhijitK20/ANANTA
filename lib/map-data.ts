import type { Experience } from "@/lib/seed";

export type ExperienceFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: { id: string; name: string; area: string; price: string; category: string };
  }>;
};

export function experiencesToGeoJson(experiences: Experience[]): ExperienceFeatureCollection {
  return {
    type: "FeatureCollection",
    features: experiences.map((experience) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: experience.coordinates },
      properties: { id: experience.id, name: experience.name, area: experience.area, price: experience.price, category: experience.category },
    })),
  };
}
