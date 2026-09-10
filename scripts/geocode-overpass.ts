/**
 * Bulk geocoding via the Overpass API.
 *
 * Instead of one Nominatim request per place (rate-limited to death at ~1,000
 * names), this fetches EVERY named OSM feature per area bbox in 23 bulk
 * queries, caches the dumps, and matches place names locally with tolerant
 * token comparison (OSM spellings drift, e.g. "Khargar" for "Kharghar").
 *
 * Output merges into lib/data/geocoded.generated.ts. Rows already present
 * (earlier Nominatim matches) are kept; Overpass only fills the gaps.
 *
 * Usage:
 *   npx tsx scripts/geocode-overpass.ts            # fetch dumps + match
 *   npx tsx scripts/geocode-overpass.ts --match    # local match only (cached dumps)
 */
import fs from "node:fs";
import path from "node:path";
import { zoneRows } from "../lib/data/zones";
import { foodNames } from "../lib/data/places/food";
import { nightlifeNames } from "../lib/data/places/nightlife";
import { shoppingNames } from "../lib/data/places/shopping";
import { adventureNames } from "../lib/data/places/adventure";
import { recreationNames } from "../lib/data/places/recreation";
import { stayNames } from "../lib/data/places/stay";
import { cultureNames } from "../lib/data/places/culture";
import { natureNames } from "../lib/data/places/nature";
import { workshopNames } from "../lib/data/places/workshop";
import { familyNames } from "../lib/data/places/family";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_FILE = path.join(ROOT, "lib", "data", "geocoded.generated.ts");
const CACHE_DIR = "/tmp/ananta-geocache";
const PAD_LNG = 0.07;
const PAD_LAT = 0.06;
const OVERPASS = "https://overpass-api.de/api/interpreter";

const NAMES_BY_CATEGORY: Record<string, Record<string, string[]>> = {
  Food: foodNames, Nightlife: nightlifeNames, Shopping: shoppingNames, Adventure: adventureNames,
  Recreation: recreationNames, Stay: stayNames, Culture: cultureNames, Nature: natureNames,
  Workshop: workshopNames, Family: familyNames,
};

const VALID_AREAS = new Set(zoneRows.map((zone) => zone.area));
const ZONE_BY_AREA = new Map(zoneRows.map((zone) => [zone.area, zone]));

const slug = (value: string) =>
  value.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Trailing words that describe the experience, not the venue. */
const MODIFIERS = new Set([
  "morning", "afternoon", "evening", "night", "sunrise", "sunset", "monsoon", "weekend",
  "slot", "experience", "outing", "session", "visit", "trip", "tour", "walk", "stroll",
  "hike", "trek", "run", "ride", "drive", "browsing", "hop", "view", "trail", "lane",
  "lanes", "street", "market", "food", "shopping", "district", "precinct", "area",
]);

/** Per-category experience words: stripped from place names before matching so
 * descriptors like "night bar" or "intro class" do not dilute the token score. */
const CATEGORY_MODIFIERS: Record<string, Set<string>> = {
  Food: new Set(["counters", "counter", "carts", "cart", "stalls", "stall", "lunch", "dinner", "breakfast", "delivery"]),
  Nightlife: new Set(["bar", "lounge", "microbrewery", "rooftop"]),
  Shopping: new Set(["store", "shops", "shop", "bazaar", "textile", "stationery"]),
  Adventure: new Set(["entry", "rappelling", "kayaking", "camp", "camping", "base"]),
  Recreation: new Set(["benches", "katta", "yoga", "promenade", "joggers"]),
  Stay: new Set(["stay", "stays", "wing", "equivalent", "guesthouse", "guesthouses", "hostel", "suite", "rooms"]),
  Culture: new Set(["hall", "stop", "stops", "viewing", "auction"]),
  Nature: new Set(["network", "groves", "grove", "edge", "viewpoint", "viewpoints"]),
  Workshop: new Set(["class", "classes", "studio", "studios", "intro", "beginner", "workshop", "workshops", "lesson", "lessons"]),
  Family: new Set(["family", "families", "kids", "boating", "picnic", "play"]),
};

/** Area names and well-known aliases: place names repeat them ("Colaba
 * Causeway ...", "SGNP ..."), and they belong to the area, not the venue. */
const AREA_ALIASES = new Set([
  "sgnp", "csmt", "sanjay", "gandhi", "national", ...zoneRows.map((zone) => zone.area.toLowerCase().split(/[^a-z0-9]+/)).flat(),
]);

const STOP = new Set(["the", "and", "of", "in", "at", "for", "with", "mumbai", "navi"]);

function tokens(name: string, category?: string): string[] {
  const extra = category ? CATEGORY_MODIFIERS[category] : undefined;
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(
    (token) => token.length >= 3 && !STOP.has(token) && !AREA_ALIASES.has(token)
      && !MODIFIERS.has(token) && !(extra && extra.has(token)),
  );
}

/** Venue-type words: a 2-token match on one of these alone proves nothing. */
const GENERIC = new Set([
  "road", "station", "park", "garden", "gardens", "lake", "mall", "hotel", "cafe", "café",
  "restaurant", "bar", "club", "museum", "gallery", "beach", "temple", "church", "mosque",
  "market", "centre", "center", "tower", "building", "complex", "plaza", "chowk", "marg",
  "court", "house", "cinema", "theatre", "theater", "hospital", "school", "college",
  "campus", "office", "arch", "gate", "bridge", "terminus", "point", "hill", "hills",
  "fort", "docks", "dock", "pier", "library", "ground", "grounds", "field", "institute",
]);

/** Acronym from an element name's words: "General Post Office" -> "gpo". */
function acronymOf(name: string): string | null {
  const words = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length < 2 || words.length > 6) return null;
  const acronym = words.map((word) => word[0].toLowerCase()).join("");
  return acronym.length >= 2 ? acronym : null;
}

function lev(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const prev = new Array(n + 1).fill(0).map((_, i) => i);
  const curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    for (let j = 0; j <= n; j += 1) prev[j] = curr[j];
  }
  return prev[n];
}

/** Tolerant token equality: exact, prefix >=5, or edit distance <=1 for
 * tokens of 6+ characters (catches OSM spelling drift like kharghar/khargar). */
function tokenEq(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (a.length >= 6 && b.length >= 6 && lev(a, b) <= 1) return true;
  return false;
}

type Element = { name: string; names: string[]; acronyms: string[]; lng: number; lat: number };

type Task = { id: string; name: string; area: string };

function allTasks(): Task[] {
  const tasks: Task[] = [];
  for (const namesByArea of Object.values(NAMES_BY_CATEGORY)) {
    for (const [area, names] of Object.entries(namesByArea)) {
      if (!VALID_AREAS.has(area)) continue;
      for (const name of names) tasks.push({ id: slug(name), name, area });
    }
  }
  return tasks;
}

// ---- saved rows (merge target) ----
type Row = { id: string; coordinates: [number, number]; match: string };

function readSaved(): Map<string, Row> {
  if (!fs.existsSync(OUT_FILE)) return new Map();
  const source = fs.readFileSync(OUT_FILE, "utf8");
  const start = source.indexOf("= [");
  const end = source.lastIndexOf("];");
  try {
    const rows: Row[] = JSON.parse(source.slice(start + 2, end + 1));
    return new Map(rows.map((row) => [row.id, row]));
  } catch {
    return new Map();
  }
}

function writeSaved(rows: Map<string, Row>) {
  const body =
    "// Generated by scripts/geocode-places.ts and scripts/geocode-overpass.ts - do not edit by hand.\n" +
    "// Coordinates come from OpenStreetMap (Nominatim / Overpass) and were validated\n" +
    "// against their area. Missing ids keep the area-anchor pin with an honest\n" +
    "// demo-estimate confidence label in the factory.\n" +
    "export type GeocodedPlace = { id: string; coordinates: [number, number]; match: string };\n\n" +
    "export const geocodedPlaces: GeocodedPlace[] = " + JSON.stringify(Array.from(rows.values()), null, 2) + ";\n";
  fs.writeFileSync(OUT_FILE, body);
}

// ---- overpass dumps ----
async function fetchAreaDump(area: string): Promise<Element[]> {
  const cacheFile = path.join(CACHE_DIR, area.replace(/[^a-z0-9]+/gi, "_") + ".json");
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, "utf8")) as Element[];
  }
  const zone = ZONE_BY_AREA.get(area);
  if (!zone) return [];
  const [lng, lat] = zone.coordinates;
  const bbox = `${(lat - PAD_LAT).toFixed(4)},${(lng - PAD_LNG).toFixed(4)},${(lat + PAD_LAT).toFixed(4)},${(lng + PAD_LNG).toFixed(4)}`;
  const query = `[out:json][timeout:90];(nwr["name"](${bbox}););out center tags;`;
  let response: Response | null = null;
  // Overpass mirrors are heavily loaded: back off on 429/504 before giving up.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(OVERPASS, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Ananta-demo-dataset/1.0" },
      body: "data=" + encodeURIComponent(query),
    });
    if (response.ok) break;
    if (![429, 502, 503, 504].includes(response.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 25000));
  }
  if (!response || !response.ok) throw new Error("overpass " + (response ? response.status : "?") + " for " + area);
  const data = await response.json();
  const elements: Element[] = [];
  for (const element of data.elements ?? []) {
    const name: string | undefined = element.tags?.name;
    const center = element.center ?? (element.lat !== undefined ? { lat: element.lat, lon: element.lon } : undefined);
    if (!name || !center) continue;
    const extra = [element.tags?.["name:en"], element.tags?.brand, element.tags?.operator].filter(Boolean) as string[];
    const lowered = Array.from(new Set([name, ...extra].map((value) => value.toLowerCase())));
    const acronyms = Array.from(new Set(lowered.map(acronymOf).filter(Boolean) as string[]));
    elements.push({
      name,
      names: lowered,
      acronyms,
      lng: center.lon,
      lat: center.lat,
    });
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(elements));
  return elements;
}

function distanceKm(a: [number, number], b: [number, number]): number {
  const dLng = (a[0] - b[0]) * 111.32 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dLat = (a[1] - b[1]) * 110.57;
  return Math.sqrt(dLng * dLng + dLat * dLat);
}

function matchTask(task: Task, elements: Element[], anchor: [number, number]): Row | null {
  const placeTokens = tokens(task.name, taskCategory(task));
  if (!placeTokens.length) return null;
  // Per-element qualification, evaluated independently of dump order: an
  // element qualifies when its token score clears the threshold AND the
  // relaxation rules hold for its own name length. First qualified element
  // (stable dump order) wins.
  let best: Element | null = null;
  let bestScore = -1;
  for (const element of elements) {
    // The fetch bbox is generous, so enforce the area radius here: a corner
    // match 6 km out belongs to a neighboring neighborhood, not this area.
    if (distanceKm(anchor, [element.lng, element.lat]) > 3.5) continue;
    const elementTokens = element.names.flatMap((name) => name.split(/[^a-z0-9]+/)).filter(Boolean);
    let overlap = 0;
    let distinctiveHit = false;
    for (const placeToken of placeTokens) {
      const hit = elementTokens.some((elementToken) => tokenEq(placeToken, elementToken))
        || (element.acronyms ?? []).some((acronym) => tokenEq(placeToken, acronym));
      if (hit) {
        overlap += 1;
        if (!GENERIC.has(placeToken) && placeToken.length >= 4) distinctiveHit = true;
      }
    }
    const score = overlap / placeTokens.length;
    const threshold = placeTokens.length >= 3 ? 0.5 : 0.99;
    if (score < threshold) continue;
    // The element's own name length decides how much a partial hit proves:
    // "Dhanji" inside a 7-token donor-attribution health centre is noise,
    // while a venue actually named "Tulsi Lake" proves the 2-token place.
    const nameTokens = element.name.split(/[^a-zA-Z0-9]+/).filter(Boolean).length;
    if (placeTokens.length === 1 && !(distinctiveHit && nameTokens <= 3)) continue;
    if (placeTokens.length === 2 && score < 0.99 && !(distinctiveHit && nameTokens <= 3)) continue;
    if (score > bestScore) {
      bestScore = score;
      best = element;
    }
  }
  if (!best) return null;
  return { id: task.id, coordinates: [best.lng, best.lat], match: best.name };
}

/** Category lookup for a task id (ids are slugs of names, not reversible, so
 * category comes from the task during matching). */
let TASK_CATEGORY: Map<string, string> | null = null;
function taskCategory(task: Task): string | undefined {
  if (!TASK_CATEGORY) {
    TASK_CATEGORY = new Map();
    for (const [category, namesByArea] of Object.entries(NAMES_BY_CATEGORY)) {
      for (const [area, names] of Object.entries(namesByArea)) {
        if (!VALID_AREAS.has(area)) continue;
        for (const name of names) TASK_CATEGORY.set(slug(name), category);
      }
    }
  }
  return TASK_CATEGORY.get(task.id);
}

async function main() {
  const matchOnly = process.argv.includes("--match");
  const prune = process.argv.includes("--prune");
  const tasks = allTasks();
  const saved = readSaved();
  console.log("tasks: " + tasks.length + " | already geocoded: " + saved.size);

  if (prune) {
    const areaOfTask = new Map(tasks.map((task) => [task.id, task.area]));
    let removed = 0;
    for (const [id, row] of Array.from(saved.entries())) {
      const area = areaOfTask.get(id);
      const anchor = area ? ZONE_BY_AREA.get(area)?.coordinates : undefined;
      if (!anchor) continue;
      if (distanceKm(anchor, row.coordinates) > 3.5) {
        saved.delete(id);
        removed += 1;
        console.log("pruned " + id + " (" + distanceKm(anchor, row.coordinates).toFixed(2) + " km from " + area + ")");
      }
    }
    writeSaved(saved);
    console.log("prune done: removed " + removed + ", kept " + saved.size);
    return;
  }

  const byArea = new Map<string, Task[]>();
  for (const task of tasks) {
    if (saved.has(task.id)) continue;
    const list = byArea.get(task.area) ?? [];
    list.push(task);
    byArea.set(task.area, list);
  }

  let added = 0;
  for (const [area, areaTasks] of Array.from(byArea.entries())) {
    let elements: Element[];
    try {
      if (!matchOnly) {
        process.stdout.write("fetching " + area + " ... ");
        elements = await fetchAreaDump(area);
        console.log(elements.length + " named features");
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } else {
        elements = await fetchAreaDump(area);
      }
    } catch (error) {
      console.log("SKIP " + area + " (" + (error as Error).message + ")");
      continue;
    }
    const anchor = ZONE_BY_AREA.get(area)!.coordinates;
    for (const task of areaTasks) {
      const row = matchTask(task, elements, anchor);
      if (row) {
        saved.set(task.id, row);
        added += 1;
      }
    }
    console.log("matched " + area + ": " + areaTasks.filter((task) => saved.has(task.id)).length + "/" + areaTasks.length);
    writeSaved(saved);
  }

  writeSaved(saved);
  console.log("done. new: " + added + ", total geocoded: " + saved.size + "/" + tasks.length);
}

main();
