import { experienceSeed } from "@/lib/seed";

export type SafetyFlag = {
  field: string;
  flag: string;
};

export type HiddenGemCandidate = {
  id: string;
  name: string;
  area: string;
  zone: string;
  source: string;
  sourceUrl: string;
  confidence: string;
  lastChecked: string;
  detail: string;
  safetyFlags: SafetyFlag[];
  verificationHistory: { state: string; at: string }[];
};

const flagsByExperience: Record<string, SafetyFlag[]> = {
  "aarey-colony-nature-trail": [
    { field: "After dark", flag: "Trails are unlit after sunset" },
    { field: "Weather", flag: "Trail sections flood in heavy monsoon rain" },
  ],
  "airoli-creek-flamingo-point": [
    { field: "Season", flag: "Bird sightings vary strongly by month and tide" },
    { field: "Access", flag: "Creek edge is unsafe beyond the marked path" },
  ],
  "versova-fishing-village-walk": [
    { field: "Privacy", flag: "Residential village lanes; photograph only with permission" },
  ],
  "dadar-flower-market-morning": [
    { field: "Crowds", flag: "Wholesale hours are busy; keep to the marked walking side" },
  ],
};

const historyByExperience: Record<string, { state: string; at: string }[]> = {
  "aarey-colony-nature-trail": [
    { state: "Resident recommendation received", at: "2026-07-28" },
    { state: "Duplicate check passed", at: "2026-07-30" },
    { state: "Awaiting operator verification", at: "2026-08-08" },
  ],
  "airoli-creek-flamingo-point": [
    { state: "Resident recommendation received", at: "2026-07-01" },
    { state: "Awaiting seasonal access confirmation", at: "2026-07-15" },
  ],
  "versova-fishing-village-walk": [
    { state: "Community submission received", at: "2026-07-20" },
    { state: "Awaiting community host confirmation", at: "2026-07-28" },
  ],
  "dadar-flower-market-morning": [
    { state: "Resident recommendation received", at: "2026-08-10" },
    { state: "Awaiting market hours verification", at: "2026-08-22" },
  ],
};

const detailByExperience: Record<string, string> = {
  "aarey-colony-nature-trail": "High resident satisfaction and low tourist exposure; candidate held until access and lighting are verified.",
  "airoli-creek-flamingo-point": "Seasonal local favorite; candidate requires a confirmed season and safe viewing alignment.",
  "versova-fishing-village-walk": "Authentic koliwada walk; candidate needs a community host confirmation before discovery.",
  "dadar-flower-market-morning": "Distinctly local morning market; candidate needs verified public hours before ranking.",
};

const candidateIds = Object.keys(flagsByExperience);

/**
 * Hidden-gem candidates are residents/community-sourced records with provenance,
 * safety flags, and a verification history. Low popularity alone never qualifies.
 */
export function hiddenGemCandidates(): HiddenGemCandidate[] {
  return candidateIds
    .map((id) => experienceSeed.find((experience) => experience.id === id))
    .filter((experience): experience is (typeof experienceSeed)[number] => Boolean(experience))
    .map((experience) => ({
      id: experience.id,
      name: experience.name,
      area: experience.area,
      zone: experience.zone,
      source: experience.source,
      sourceUrl: experience.sourceUrl,
      confidence: experience.confidence,
      lastChecked: experience.lastChecked,
      detail: detailByExperience[experience.id],
      safetyFlags: flagsByExperience[experience.id],
      verificationHistory: historyByExperience[experience.id],
    }));
}
