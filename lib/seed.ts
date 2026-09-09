export type Experience = {
  id: string;
  name: string;
  area: string;
  category: string;
  price: string;
  duration: string;
  travelTime: string;
  station: string;
  status: string;
  statusTone: "blue" | "green" | "amber";
  updated: string;
  description: string;
  mediaTitle: string;
  coordinates: [number, number];
  city: "Mumbai" | "Navi Mumbai";
  zone: string;
};

export const experienceSeed: Experience[] = [
  { id: "kala-ghoda-art-walk", name: "Kala Ghoda Art Walk", area: "Fort", city: "Mumbai", zone: "Fort / Kala Ghoda", category: "Culture", price: "₹700", duration: "2 hours", travelTime: "12 min", station: "Churchgate", status: "Demo seed record", statusTone: "blue", updated: "Demo data", description: "A compact walk through galleries, public art, and heritage streets in the Fort district.", mediaTitle: "Local video awaiting verification", coordinates: [72.8311, 18.9275] },
  { id: "matunga-breakfast-trail", name: "Matunga Breakfast Trail", area: "Matunga", city: "Mumbai", zone: "Dadar / Matunga", category: "Food", price: "₹550", duration: "90 min", travelTime: "18 min", station: "Matunga Road", status: "Demo seed record", statusTone: "blue", updated: "Demo data", description: "A vegetarian breakfast route built around long-running South Indian cafés and bakeries.", mediaTitle: "Local video awaiting verification", coordinates: [72.8467, 19.0271] },
  { id: "vashi-market-loop", name: "Vashi Market Loop", area: "Vashi", city: "Navi Mumbai", zone: "Vashi", category: "Shopping", price: "Free", duration: "75 min", travelTime: "9 min", station: "Vashi", status: "Demo seed record", statusTone: "blue", updated: "Demo data", description: "A practical route through market lanes, local produce stalls, and everyday neighborhood shopping.", mediaTitle: "Local video awaiting verification", coordinates: [72.9986, 19.076] },
  { id: "kharghar-hills-view", name: "Kharghar Hills View", area: "Kharghar", city: "Navi Mumbai", zone: "Kharghar", category: "Nature", price: "Free", duration: "2.5 hours", travelTime: "24 min", station: "Kharghar", status: "Weather dependent", statusTone: "amber", updated: "Demo data", description: "A short nature outing with broad views across Navi Mumbai. Check conditions before starting.", mediaTitle: "Local video awaiting verification", coordinates: [73.0691, 19.0469] },
]; 

export type EventSeed = {
  id: string;
  name: string;
  venue: string;
  distance: string;
  timeLabel: string;
  price: string;
  category: string;
  confidence: string;
  updated: string;
  source: string;
  startMinutes: number;
  endMinutes: number;
  travelMinutes: number;
  previousVenue?: string;
  previousStartMinutes?: number;
  previousPrice?: string;
};

export const eventSeed: EventSeed[] = [
  { id: "fort-open-studios", name: "Fort Open Studios", venue: "Multiple venues in Fort", distance: "18 min away", timeLabel: "Starts 6:30 PM", price: "Free entry", category: "Art", confidence: "Demo data, not live", updated: "Needs verification", source: "Curated demo record", startMinutes: 30, endMinutes: 240, travelMinutes: 18 },
  { id: "seawoods-makers-market", name: "Seawoods Makers Market", venue: "Seawoods, Navi Mumbai", distance: "32 min away", timeLabel: "This weekend", price: "₹50 entry", previousPrice: "Free entry", category: "Market", confidence: "Demo data, not live", updated: "Needs verification", source: "Curated demo record", startMinutes: 480, endMinutes: 900, travelMinutes: 32 },
  { id: "bandra-small-stage", name: "Small Stage: Local Stories", venue: "Bandra West", previousVenue: "Bandra West community hall", previousStartMinutes: 150, distance: "26 min away", timeLabel: "Starts 8:00 PM", price: "From ₹400", category: "Performance", confidence: "Community reported", updated: "Needs confirmation", source: "Public event submission", startMinutes: 90, endMinutes: 330, travelMinutes: 26 },
];

export type MediaSeed = {
  id: string;
  experienceId: string;
  platform: "youtube" | "instagram";
  url: string;
  title: string;
  creator: string;
  mediaType: "Video" | "Reel";
  publishedAt: string;
  state: "Approved" | "Needs review" | "Archived";
  note: string;
};

export const mediaSeed: MediaSeed[] = [
  { id: "media-kala-ghoda", experienceId: "kala-ghoda-art-walk", platform: "youtube", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", title: "Galleries and street art around Kala Ghoda", creator: "Fort heritage walks", mediaType: "Video", publishedAt: "Older video", state: "Approved", note: "Demo seed record. Confirm the source shows this place before presenting it." },
  { id: "media-matunga", experienceId: "matunga-breakfast-trail", platform: "youtube", url: "https://youtu.be/9bZkp7q19f0", title: "South Indian breakfast institutions of Matunga", creator: "Mumbai food trails", mediaType: "Video", publishedAt: "This year", state: "Approved", note: "Demo seed record. Confirm the source shows this place before presenting it." },
  { id: "media-vashi", experienceId: "vashi-market-loop", platform: "instagram", url: "https://www.instagram.com/reel/demo-market-reel/", title: "Market lanes at closing hour", creator: "Navi Mumbai daily", mediaType: "Reel", publishedAt: "Recent", state: "Approved", note: "Embed not permitted for this source. Open the platform link instead." },
  { id: "media-kharghar", experienceId: "kharghar-hills-view", platform: "youtube", url: "https://www.youtube.com/watch?v=archived-demo", title: "Hilltop views after monsoon", creator: "Unverified upload", mediaType: "Video", publishedAt: "Unknown", state: "Archived", note: "Removed from discovery after the source failed verification." },
];
