import type { Experience, MediaSeed } from "@/lib/seed";
import { experienceSeed, mediaSeed } from "@/lib/seed";
import { buildExperiences, buildMediaSeed, type ReservedByArea } from "@/lib/data/factory";
import { zoneRows } from "@/lib/data/zones";
import { foodNames } from "@/lib/data/places/food";
import { nightlifeNames } from "@/lib/data/places/nightlife";
import { shoppingNames } from "@/lib/data/places/shopping";
import { adventureNames } from "@/lib/data/places/adventure";
import { recreationNames } from "@/lib/data/places/recreation";
import { stayNames } from "@/lib/data/places/stay";
import { cultureNames } from "@/lib/data/places/culture";
import { natureNames } from "@/lib/data/places/nature";
import { workshopNames } from "@/lib/data/places/workshop";
import { familyNames } from "@/lib/data/places/family";

export const DATASET_CATEGORIES = [
  "Food",
  "Nightlife",
  "Shopping",
  "Adventure",
  "Recreation",
  "Stay",
  "Culture",
  "Nature",
  "Workshop",
  "Family",
] as const;

const generated = buildExperiences(zoneRows, [...DATASET_CATEGORIES], {
  Food: foodNames,
  Nightlife: nightlifeNames,
  Shopping: shoppingNames,
  Adventure: adventureNames,
  Recreation: recreationNames,
  Stay: stayNames,
  Culture: cultureNames,
  Nature: natureNames,
  Workshop: workshopNames,
  Family: familyNames,
});

/** Hand-written records first (stable demo anchor), then the expanded set. */
export const allExperiences: Experience[] = [...experienceSeed, ...generated];

export type { Experience, MediaSeed };

/**
 * Hand-written media records first (they exercise the review/archived states),
 * then one approved oEmbed-verified video per experience that still lacks one —
 * generated places, plus any hand-written record whose video was never
 * verified. No detail page is left without an approved, embeddable video.
 */
const handApprovedIds = new Set(
  mediaSeed.filter((media) => media.state === "Approved").map((media) => media.experienceId),
);
const experiencesNeedingMedia = [
  ...experienceSeed.filter((experience) => !handApprovedIds.has(experience.id)),
  ...generated,
];

/** Hand-written approved videos reserve their video per area, so generated
 * places in the same neighborhood never repeat them. */
const areaOfExperience = new Map(allExperiences.map((experience) => [experience.id, experience.area]));
const reservedVideosByArea: ReservedByArea = new Map();
for (const media of mediaSeed) {
  if (media.state !== "Approved" || media.platform !== "youtube") continue;
  const area = areaOfExperience.get(media.experienceId);
  if (!area) continue;
  const set = reservedVideosByArea.get(area) ?? new Set<string>();
  set.add(media.url);
  reservedVideosByArea.set(area, set);
}

export const allMedia: MediaSeed[] = [...mediaSeed, ...buildMediaSeed(experiencesNeedingMedia, reservedVideosByArea)];
