import type { ZoneRow } from "@/lib/data/factory";

/**
 * Zone table: every demo area with its real neighborhood-core coordinate and
 * the nearest suburban/mainline station on record. Place tuples reference
 * these rows by `area`; the factory derives per-place pin offsets from the
 * anchor so a tuple never repeats city, zone, or station data.
 */
export const zoneRows: ZoneRow[] = [
  { zone: "Fort / Kala Ghoda", city: "Mumbai", area: "Fort", coordinates: [72.8331, 18.9317], station: "CSMT" },
  { zone: "Marine Drive / Girgaon", city: "Mumbai", area: "Marine Drive", coordinates: [72.8223, 18.9443], station: "Charni Road" },
  { zone: "Marine Drive / Girgaon", city: "Mumbai", area: "Girgaon", coordinates: [72.8129, 18.9518], station: "Charni Road" },
  { zone: "Colaba", city: "Mumbai", area: "Colaba", coordinates: [72.8156, 18.9067], station: "CSMT" },
  { zone: "Bandra", city: "Mumbai", area: "Bandra", coordinates: [72.8322, 19.0603], station: "Bandra" },
  { zone: "Juhu", city: "Mumbai", area: "Juhu", coordinates: [72.8269, 19.0985], station: "Vile Parle" },
  { zone: "Andheri", city: "Mumbai", area: "Andheri", coordinates: [72.8294, 19.1197], station: "Andheri West" },
  { zone: "Powai", city: "Mumbai", area: "Powai", coordinates: [72.9049, 19.1176], station: "Kanjurmarg" },
  { zone: "Aarey", city: "Mumbai", area: "Aarey", coordinates: [72.8719, 19.1514], station: "Goregaon" },
  { zone: "Dadar / Matunga", city: "Mumbai", area: "Dadar", coordinates: [72.8433, 19.0209], station: "Dadar" },
  { zone: "Dadar / Matunga", city: "Mumbai", area: "Matunga", coordinates: [72.8467, 19.0271], station: "Matunga Road" },
  { zone: "Worli / Lower Parel", city: "Mumbai", area: "Lower Parel", coordinates: [72.8373, 18.9964], station: "Lower Parel" },
  { zone: "Worli / Lower Parel", city: "Mumbai", area: "Worli", coordinates: [72.8231, 19.0079], station: "Lower Parel" },
  { zone: "Malabar Hill", city: "Mumbai", area: "Walkeshwar", coordinates: [72.7934, 18.9455], station: "Grant Road" },
  { zone: "Bhendi Bazaar", city: "Mumbai", area: "Bhendi Bazaar", coordinates: [72.8327, 18.9662], station: "Grant Road" },
  { zone: "Sewri / Wadala", city: "Mumbai", area: "Sewri", coordinates: [72.8588, 19.0189], station: "Sewri" },
  { zone: "Borivali / SGNP", city: "Mumbai", area: "Borivali East", coordinates: [72.8847, 19.2242], station: "Borivali" },
  { zone: "Vashi", city: "Navi Mumbai", area: "Vashi", coordinates: [72.9971, 19.0759], station: "Vashi" },
  { zone: "Nerul / Seawoods", city: "Navi Mumbai", area: "Nerul/Seawoods", coordinates: [73.0142, 19.0365], station: "Nerul" },
  { zone: "Belapur", city: "Navi Mumbai", area: "Belapur", coordinates: [73.0276, 19.0151], station: "Belapur" },
  { zone: "Kharghar", city: "Navi Mumbai", area: "Kharghar", coordinates: [73.0679, 19.0469], station: "Kharghar" },
  { zone: "Airoli", city: "Navi Mumbai", area: "Airoli", coordinates: [73.0009, 19.155], station: "Airoli" },
  { zone: "Panvel", city: "Navi Mumbai", area: "Panvel", coordinates: [73.1107, 18.9894], station: "Panvel" },
];
