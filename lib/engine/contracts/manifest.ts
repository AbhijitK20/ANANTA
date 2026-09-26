import type { CityManifest } from "./types";

/**
 * Neighbourhood anchors are copied from `lib/data/zones.ts` (`zoneRows`), the
 * already-verified 23-row zone table. They are copied rather than imported
 * because `contracts/` is the leaf of the dependency graph: it may only reach
 * out for `import type { Experience }`. If a zone row moves, both tables move.
 *
 * `Breach Candy` had no `zoneRows` entry when this file was written. Session 8
 * added it at `[72.8203, 18.9265]`, station CSMT, which is the anchor used
 * here, so the two tables agree. If either moves, both must move.
 *
 * Nothing in this file branches on a city id. Manifests hold values, code
 * reads them, and adding a third city means adding a manifest and nothing else.
 */

const MUMBAI_BBOX: [number, number, number, number] = [72.79, 18.9, 72.91, 19.23];
const NAVI_BBOX: [number, number, number, number] = [72.99, 18.98, 73.12, 19.16];

export const MUMBAI_MANIFEST: CityManifest = {
  id: "mumbai",
  displayName: "Mumbai",
  currency: "INR",
  timezone: "Asia/Kolkata",
  bbox: MUMBAI_BBOX,
  neighbourhoods: [
    { name: "Fort", coordinates: [72.8331, 18.9317], station: "CSMT" },
    { name: "Marine Drive", coordinates: [72.8223, 18.9443], station: "Charni Road" },
    { name: "Girgaon", coordinates: [72.8129, 18.9518], station: "Charni Road" },
    { name: "Colaba", coordinates: [72.8156, 18.9067], station: "CSMT" },
    { name: "Bandra", coordinates: [72.8322, 19.0603], station: "Bandra" },
    { name: "Juhu", coordinates: [72.8269, 19.0985], station: "Vile Parle" },
    { name: "Andheri", coordinates: [72.8294, 19.1197], station: "Andheri West" },
    { name: "Powai", coordinates: [72.9049, 19.1176], station: "Kanjurmarg" },
    { name: "Aarey", coordinates: [72.8719, 19.1514], station: "Goregaon" },
    { name: "Dadar", coordinates: [72.8433, 19.0209], station: "Dadar" },
    { name: "Matunga", coordinates: [72.8467, 19.0271], station: "Matunga Road" },
    { name: "Lower Parel", coordinates: [72.8373, 18.9964], station: "Lower Parel" },
    { name: "Worli", coordinates: [72.8231, 19.0079], station: "Lower Parel" },
    { name: "Walkeshwar", coordinates: [72.7934, 18.9455], station: "Grant Road" },
    { name: "Bhendi Bazaar", coordinates: [72.8327, 18.9662], station: "Grant Road" },
    { name: "Sewri", coordinates: [72.8588, 19.0189], station: "Sewri" },
    { name: "Borivali East", coordinates: [72.8847, 19.2242], station: "Borivali" },
    { name: "Breach Candy", coordinates: [72.8203, 18.9265], station: "CSMT" },
  ],
  monsoonMonths: [6, 7, 8, 9],
  congestion: { walk: 1.0, auto: 1.6, taxi: 1.9, metro: 1.15, ferry: 1.0 },
  ferryCorridors: [
    { from: "Marine Drive", to: "Nerul/Seawoods", minutes: 20 },
  ],
  notes:
    "Congestion multipliers are our own estimates, not measurements, and they are " +
    "labelled as estimates in the UI. Walking 1.0 by definition. Metro 1.15 for " +
    "last-mile walking at both ends. Taxi 1.9 is a single all-day average: the real " +
    "figure swings from about 1.3 off-peak to above 3 in the 6 to 11 am and 5 to 9 pm " +
    "bands, and we do not model the peak band yet. Autos 1.6. Ferry 1.0. " +
    "South Mumbai traffic is the reason a 6 km leg costs more time than a 6 km leg " +
    "across the harbour, which is why superlinearTravel is quadratic in km. " +
    "Monsoon months 6 to 9 drive seasonal_mismatch. This manifest holds values " +
    "only; no code branches on the city id.",
};

export const NAVI_MUMBAI_MANIFEST: CityManifest = {
  id: "navi-mumbai",
  displayName: "Navi Mumbai",
  currency: "INR",
  timezone: "Asia/Kolkata",
  bbox: NAVI_BBOX,
  neighbourhoods: [
    { name: "Vashi", coordinates: [72.9971, 19.0759], station: "Vashi" },
    { name: "Nerul/Seawoods", coordinates: [73.0142, 19.0365], station: "Nerul" },
    { name: "Belapur", coordinates: [73.0276, 19.0151], station: "Belapur" },
    { name: "Kharghar", coordinates: [73.0679, 19.0469], station: "Kharghar" },
    { name: "Airoli", coordinates: [73.0009, 19.155], station: "Airoli" },
    { name: "Panvel", coordinates: [73.1107, 18.9894], station: "Panvel" },
  ],
  monsoonMonths: [6, 7, 8, 9],
  congestion: { walk: 1.0, auto: 1.5, taxi: 1.7, metro: 1.15, ferry: 1.0 },
  ferryCorridors: [
    { from: "Nerul/Seawoods", to: "Belapur", minutes: 12 },
    { from: "Nerul/Seawoods", to: "Kharghar", minutes: 25 },
    { from: "Nerul/Seawoods", to: "Airoli", minutes: 22 },
    { from: "Vashi", to: "Belapur", minutes: 18 },
    { from: "Nerul/Seawoods", to: "Marine Drive", minutes: 20 },
  ],
  notes:
    "Congestion multipliers are our own estimates, not measurements, and they are " +
    "labelled as estimates in the UI. The planned grid makes road times more " +
    "predictable than the island city, so taxi is 1.7 here against 1.9 in Mumbai. " +
    "Metro 1.15 is carried over unchanged even though the line barely serves this " +
    "city, so a metro plan does not silently read as free. Ferry 1.0. " +
    "Ferry durations are scheduled crossing times, and they hold the real shape of " +
    "this city: a planned road network, a working water route, and no single mode " +
    "that wins everywhere. Monsoon months 6 to 9. This manifest holds values only; " +
    "no code branches on the city id.",
};

export const CITY_MANIFESTS: Record<string, CityManifest> = {
  mumbai: MUMBAI_MANIFEST,
  "navi-mumbai": NAVI_MUMBAI_MANIFEST,
};

export function getCityManifest(id: string): CityManifest {
  const found = CITY_MANIFESTS[id];
  if (!found) {
    const known = Object.keys(CITY_MANIFESTS).sort().join(", ");
    throw new Error(`Unknown city manifest "${id}". Known ids: ${known}.`);
  }
  return found;
}
