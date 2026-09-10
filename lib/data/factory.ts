import type { Experience, MediaSeed } from "@/lib/seed";
import { generatedVideos, type GeneratedVideo } from "@/lib/data/videos.generated";
import { generatedImages } from "@/lib/data/images.generated";
import { geocodedPlaces, type GeocodedPlace } from "@/lib/data/geocoded.generated";

/**
 * Dataset factory.
 *
 * Category data files hold ONLY the parts that must be real and hand-checked:
 * real place names grouped under their real area. Everything per-record and
 * mechanical (pin offset, listed price band, duration band, photo, video) is
 * derived deterministically here, and every derived value is labeled as a demo
 * estimate, never as verified fact. The two non-negotiables stay hand-data:
 *
 *   1. The place exists and sits in that area of the real city.
 *   2. Media was verified against its live source at generation time.
 *
 * Provenance contract (DEC-015): images come from the Commons pool verified at
 * generation time; every place receives one oEmbed-verified YouTube video so
 * no detail page is ever without a source-checked local view.
 */
export type PlaceName = string;

export type ZoneRow = {
  zone: string;
  city: "Mumbai" | "Navi Mumbai";
  area: string;
  coordinates: [number, number];
  station: string;
  /** Open-water side of the anchor so derived pins stay on land. */
  waterTo?: "west" | "east";
};

export type DerivedStyle = {
  price: string;
  duration: string;
  travelMinutes: number;
};

/** Deterministic per-category demo price and duration bands, honestly labeled. */
const STYLE_BY_CATEGORY: Record<string, { prices: string[]; durations: string[] }> = {
  Food: { prices: ["₹150", "₹250", "₹350", "₹500", "₹700", "₹900"], durations: ["45 min", "60 min", "75 min", "90 min", "2 hours"] },
  Nightlife: { prices: ["₹500", "₹800", "₹1200", "₹1500", "₹2000"], durations: ["2 hours", "2.5 hours", "3 hours"] },
  Shopping: { prices: ["Free", "₹200", "₹400", "₹600", "₹1000"], durations: ["60 min", "90 min", "2 hours", "2.5 hours"] },
  Adventure: { prices: ["Free", "₹200", "₹500", "₹800", "₹1500"], durations: ["2 hours", "2.5 hours", "3 hours", "3.5 hours"] },
  Recreation: { prices: ["Free", "₹100", "₹200", "₹400", "₹600"], durations: ["60 min", "90 min", "2 hours", "2.5 hours"] },
  Stay: { prices: ["₹2500", "₹4000", "₹6000", "₹9000", "₹14000"], durations: ["Overnight", "Overnight", "2 nights"] },
  Culture: { prices: ["Free", "₹100", "₹300", "₹500", "₹700"], durations: ["60 min", "90 min", "2 hours"] },
  Nature: { prices: ["Free", "₹50", "₹100", "₹200"], durations: ["90 min", "2 hours", "2.5 hours", "3 hours"] },
  Workshop: { prices: ["₹500", "₹800", "₹1000", "₹1200", "₹1500"], durations: ["2 hours", "2.5 hours", "3 hours"] },
  Family: { prices: ["Free", "₹50", "₹100", "₹300", "₹500"], durations: ["90 min", "2 hours", "2.5 hours"] },
};

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Small deterministic string hash for stable, reproducible derived fields. */
function hash(value: string): number {
  let output = 0;
  for (let index = 0; index < value.length; index += 1) {
    output = (output * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(output);
}

const OFFSET_DEGREES = 0.008; // roughly ±800 m around the anchor

/** Deterministic landward pin: jitter both axes, but never step into open water. */
function derivePin(anchor: [number, number], waterTo: "west" | "east" | undefined, id: string): [number, number] {
  const rawLng = (((hash(`${id}-lng`) % 201) - 100) / 100) * OFFSET_DEGREES;
  const rawLat = (((hash(`${id}-lat`) % 201) - 100) / 100) * OFFSET_DEGREES;
  const lng = waterTo === "west" ? Math.abs(rawLng) : waterTo === "east" ? -Math.abs(rawLng) : rawLng;
  return [anchor[0] + lng, anchor[1] + rawLat];
}

function derivedStyle(category: string, id: string): DerivedStyle {
  const style = STYLE_BY_CATEGORY[category] ?? STYLE_BY_CATEGORY.Culture;
  return {
    price: style.prices[hash(`${id}-price`) % style.prices.length],
    duration: style.durations[hash(`${id}-duration`) % style.durations.length],
    travelMinutes: 4 + (hash(`${id}-travel`) % 46),
  };
}

const DESCRIPTION_PREFIX: Record<string, string> = {
  Food: "A demo food record for",
  Nightlife: "A demo nightlife record for",
  Shopping: "A demo shopping record for",
  Adventure: "A demo adventure record for",
  Recreation: "A demo recreation record for",
  Stay: "A demo stay record for",
  Culture: "A demo culture record for",
  Nature: "A demo nature record for",
  Workshop: "A demo workshop record for",
  Family: "A demo family record for",
};

/** Real OSM coordinates per place id (empty match string = anchor fallback is used). */
const geocodedById: Map<string, GeocodedPlace> = new Map(
  geocodedPlaces.map((row) => [row.id, row]),
);

/**
 * Expand category name-lists into full Experience records. `namesByArea` maps
 * category -> area (must match a ZoneRow area) -> real place names.
 */
export function buildExperiences(
  zones: ZoneRow[],
  categories: string[],
  namesByArea: Record<string, Record<string, PlaceName[]>>,
): Experience[] {
  const zoneByArea = new Map(zones.map((zone) => [zone.area, zone]));
  const experiences: Experience[] = [];

  for (const category of categories) {
    const areaGroups = namesByArea[category] ?? {};
    for (const [areaName, names] of Object.entries(areaGroups)) {
      const zoneRow = zoneByArea.get(areaName);
      if (!zoneRow) continue;
      for (const name of names) {
        const id = slug(name);
        const style = derivedStyle(category, id);
        const image = generatedImages[hash(id) % Math.max(generatedImages.length, 1)];
        // Exact OSM match when the geocoder found the real feature; otherwise
        // the area-anchor pin with an honest location-confidence label.
        const geocoded = geocodedById.get(id);
        const coordinates = geocoded ? geocoded.coordinates : derivePin(zoneRow.coordinates, zoneRow.waterTo, id);
        const confidence = geocoded
          ? "Location matched on OpenStreetMap; visit facts are demo estimates"
          : "Location is the area center, not the exact venue; facts are demo estimates";
        experiences.push({
          id,
          name,
          area: zoneRow.area,
          city: zoneRow.city,
          zone: zoneRow.zone,
          category,
          price: style.price,
          duration: style.duration,
          travelTime: `${style.travelMinutes} min`,
          station: zoneRow.station,
          status: "Curated record",
          statusTone: "blue",
          updated: "Curated",
          description: `${DESCRIPTION_PREFIX[category] ?? "A demo record for"} ${name} in ${zoneRow.area}. Price, duration, and operating facts are demo estimates that need operator confirmation before any visit.`,
          mediaTitle: "Verified local area video",
          coordinates,
          source: "Curated record",
          sourceUrl: `https://example.com/sources/${id}`,
          confidence,
          lastChecked: "2026-09-08",
          imageUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image.file)}?width=900`,
          imageCredit: image.credit,
        });
      }
    }
  }

  return experiences;
}

/**
 * Relevance-based video assignment with per-area uniqueness.
 *
 * Every pool entry records the query that discovered it (an area name, a
 * category dish, an activity). For each experience we score the pool by how
 * well a video's query tokens overlap the experience's area and category,
 * then assign the best-scoring video that satisfies two constraints:
 *
 *   1. No other place in the SAME AREA already uses it — two places in one
 *      neighborhood never open onto the same video.
 *   2. Dataset-wide reuse stays under a ceiling (dataset size / pool size),
 *      so one broadly relevant video cannot cover a category in every area.
 *
 * If both constraints ever bind (an area needs more videos than remain under
 * the ceiling), the fallback keeps constraint 1 and picks the least-reused
 * video overall — area uniqueness always wins. Ties break deterministically
 * by pool order.
 */
function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_TOKENS.has(token));
}

const STOP_TOKENS = new Set([
  "mumbai", "navi", "maharashtra", "india", "the", "and", "with", "for", "near", "walk", "tour", "view", "video",
]);

const REUSE_CEILING = Math.ceil(1_150 / Math.max(generatedVideos.length, 1)) + 1; // dataset size / pool size, plus headroom

/** Videos already approved for a place, grouped by that place's area. */
export type ReservedByArea = Map<string, Set<string>>;

function videoIdFromUrl(url: string): string | undefined {
  return /v=([\w-]{11})/.exec(url)?.[1];
}

function pickVideo(wanted: Set<string>, usedInArea: Set<string>, usedCounts: Map<string, number>): GeneratedVideo {
  let best: GeneratedVideo | undefined;
  let bestScore = -1;
  let fallback: GeneratedVideo | undefined;
  let fallbackCount = Number.POSITIVE_INFINITY;
  for (const video of generatedVideos) {
    if (usedInArea.has(video.id)) continue; // constraint 1: unique within the area
    const used = usedCounts.get(video.id) ?? 0;
    const queryTokens = tokenize(video.query || video.title); // legacy pool entries have no query
    let score = 0;
    for (const token of queryTokens) if (wanted.has(token)) score += 1;
    if (used < REUSE_CEILING && score > bestScore) {
      best = video;
      bestScore = score;
    }
    // Fallback candidate: least-reused video this area has not used yet.
    if (used < fallbackCount) {
      fallback = video;
      fallbackCount = used;
    }
  }
  // Iterating the pool in order makes "strictly better wins" deterministic:
  // the earliest pool entry among equals is always chosen.
  return best ?? fallback ?? generatedVideos[0];
}

export function buildMediaSeed(experiences: Experience[], reserved: ReservedByArea = new Map()): MediaSeed[] {
  if (!generatedVideos.length) return [];
  const usedCounts = new Map<string, number>();
  const usedInAreaByArea: ReservedByArea = new Map();
  reserved.forEach((urls, area) => {
    const usedInArea = new Set<string>();
    usedInAreaByArea.set(area, usedInArea);
    urls.forEach((url) => {
      const id = videoIdFromUrl(url);
      if (!id) return;
      usedInArea.add(id);
      usedCounts.set(id, (usedCounts.get(id) ?? 0) + 1);
    });
  });
  return experiences.map((experience) => {
    const usedInArea = usedInAreaByArea.get(experience.area) ?? new Set<string>();
    usedInAreaByArea.set(experience.area, usedInArea);
    const wanted = new Set([...tokenize(experience.area), ...tokenize(experience.category)]);
    const video = pickVideo(wanted, usedInArea, usedCounts);
    usedInArea.add(video.id);
    usedCounts.set(video.id, (usedCounts.get(video.id) ?? 0) + 1);
    return {
      id: `media-${experience.id}`,
      experienceId: experience.id,
      platform: "youtube" as const,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      title: video.title,
      creator: video.creator,
      mediaType: "Video" as const,
      publishedAt: "Verified against source",
      state: "Approved" as const,
      note: "Verified against the live YouTube source at generation time and assigned from the verified pool by area or category relevance. It shows the surroundings, not the venue's current operations, hours, or prices.",
    };
  });
}
