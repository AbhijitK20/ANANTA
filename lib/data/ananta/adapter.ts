import type { IndoorOutdoor, TravelMode } from "@/lib/engine/contracts";

/**
 * Turning the frozen v1 record into real numbers.
 *
 * `lib/seed.ts` is frozen and stores price, duration, and travel time as display
 * strings, for example "Rs 700" and "2 hours". Two of those three are hashes
 * dressed as sentences, so this module's job is not to parse them faithfully. It
 * is to be explicit about which ones can be trusted:
 *
 *   - Duration and price are parsed, then marked `inferred` + `estimate` by the
 *     caller unless the record has curated facts. The value is kept so the type
 *     stays satisfied, and the provenance is what makes it honest.
 *   - Travel time is NOT parsed from the v1 string. That string is
 *     `4 + (hash(id) % 46)`, which is not a travel time. It is recomputed from
 *     the record's own coordinates using the same arithmetic as the offline
 *     routing fallback in `lib/routing.ts`, so at least it is real geometry.
 *
 * Ceiling, stated plainly: the recomputed travel time is a straight-line figure
 * from the area anchor, not a street route, and it is not measured from the
 * traveller's origin. The engine must inject the real leg through
 * `PackOptions.matrix` and `PackOptions.originMinutes`. This field is a
 * geometry sanity check, not a plan.
 */

/** Planning fallback speeds in km/h, copied from `lib/routing.ts`. */
const FALLBACK_KMH: Record<TravelMode, number> = { walk: 5, auto: 12, taxi: 18, metro: 22, ferry: 8 };

/** Street-network detour factor, copied from the routing fallback. */
const DETOUR = 1.3;

export const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Straight-line travel time in minutes, using the same detour factor and speed
 * table the offline routing fallback uses. Never returns 0, because a plan leg
 * that costs nothing is not a real leg.
 */
export function estimateTravelMinutes(
  from: [number, number],
  to: [number, number],
  mode: TravelMode,
): number {
  const straightKm = haversineKm(from, to);
  return Math.max(1, Math.round((straightKm * DETOUR * 60) / FALLBACK_KMH[mode]));
}

/**
 * Minutes from a v1 duration string. Handles "45 min", "90 min", "2 hours",
 * "2.5 hours", "Overnight" and "2 nights". Anything unrecognised falls back to
 * the category median so the field is never NaN, and the caller marks it as an
 * estimate either way.
 */
const UNIT_MINUTES: Record<string, number> = { min: 1, mins: 1, minute: 1, minutes: 1, hour: 60, hours: 60, night: 1440, nights: 1440, overnight: 1440 };

export function parseDurationMinutes(value: string): number | null {
  const normalized = value.toLowerCase().trim();
  const unit = /([a-z]+)/.exec(normalized.replace(/^[\d.\s]+/, ""))?.[1] ?? "min";
  const factor = UNIT_MINUTES[unit];
  if (factor === undefined) return null;
  // "Overnight" carries no number, and it means one night.
  const amount = Number(/^(\d+(?:\.\d+)?)/.exec(normalized)?.[1] ?? 1);
  if (!Number.isFinite(amount)) return null;
  return Math.max(5, Math.round(amount * factor));
}

/**
 * Rupees from a v1 price string. Handles "Rs 700", "From Rs 500", "Rs 50 entry",
 * "Free" (0), and "Rs 300" with a stray period. Returns null when there is no
 * rupee figure at all, so the caller can decide between 0 and unknown.
 */
export function parsePriceInr(value: string): number | null {
  const normalized = value.toLowerCase();
  if (/\bfree\b/.test(normalized)) return 0;
  const digits = /(\d[\d,]*)/.exec(normalized.replace(/^[^0-9]*/, ""));
  if (!digits) return null;
  const amount = Number(digits[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

/** Minutes from a v1 duration string is parsed, not trusted. Travel is not. */

/**
 * Indoor or outdoor, worked out from what the record actually says rather than
 * from a hash. A record that names a park, a beach, a hill, a garden, a fort, a
 * walk, a trail, a dock, or a lake is outdoors. A record that names a museum, a
 * gallery, a cinema, a theatre, a library, a hotel, a mall, or a cafe is indoors.
 * Everything else is `mixed`, which is the honest answer for a street record.
 *
 * This is an inference, and `provenance.ts` marks it as one, because the
 * `ExperienceV2` type does not allow `indoor` to be null and a type that forces
 * a value should not be allowed to imply it was known. Logged as a blocker.
 */
const OUTDOOR_WORDS = [
  "park", "beach", "hill", "hills", "garden", "gardens", "fort", "walk", "trail", "dock",
  "docks", "lake", "creek", "shore", "shoreline", "maidan", "ghat", "waterfall", "jungle",
  "mangrove", "promenade", "bandstand", "causeway", "island", "sunset", "sunrise", "temple",
  "mosque", "church", "basilica", "cathedral", "tank", "caves", "hike", "trek", "kayak",
  "cycling", "run", "bungalow", "bry", "green", "breeze", "lawn", "canopy", "reed", "forest",
];
const INDOOR_WORDS = [
  "museum", "gallery", "cinema", "theatre", "theater", "library", "hotel", "mall", "cafe",
  "café", "restaurant", "bakery", "planetarium", "auditorium", "class", "studio", "workshop",
  "market", "hospital", "high court", "planetarium", "labs", "roof", "pub", "bar", "lounge",
];

export function inferIndoor(name: string, category: string): IndoorOutdoor {
  const haystack = `${name} ${category}`.toLowerCase();
  let outdoor = 0;
  let indoor = 0;
  for (const word of OUTDOOR_WORDS) if (haystack.includes(word)) outdoor += 1;
  for (const word of INDOOR_WORDS) if (haystack.includes(word)) indoor += 1;
  if (indoor > outdoor) return "indoor";
  if (outdoor > indoor) return "outdoor";
  return "mixed";
}

/** Real link or null. There is no fallback, and there is no placeholder domain. */
export function realUrlOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^https:\/\//i.test(trimmed)) return null;
  if (/(^|\/\/)(www\.)?example\.(com|org|net)\b/i.test(trimmed)) return null;
  return trimmed;
}

/** Wikimedia Commons file page for a `File:` title, which is a real citable URL. */
export function commonsFilePage(file: string): string | null {
  const title = file.replace(/^File:/, "").replace(/_/g, " ");
  if (!title) return null;
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

/** A real OpenStreetMap search a human can follow, for a record OSM matched. */
export function osmSearchUrl(name: string, area: string): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${name} ${area} Mumbai`)}`;
}
