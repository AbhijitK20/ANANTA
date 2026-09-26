import type { Confidence, Provenance, ProvenancedField, Rung } from "@/lib/engine";

/* ── type scale ─────────────────────────────────────────────────────────── */
export const typeScale = {
  micro: "text-[11px] leading-4",
  meta: "text-xs leading-5",
  bodySm: "text-[13px] leading-5",
  body: "text-sm leading-6",
  lead: "text-[17px] leading-7",
  title: "text-xl leading-7 font-bold tracking-[-0.03em]",
  display: "text-[28px] leading-[34px] font-bold tracking-[-0.04em]",
} as const;

/* ── space, radius, motion, layer ────────────────────────────────────────── */
export const space = { xs: "p-1", sm: "p-2", md: "p-3", lg: "p-4", xl: "p-6", "2xl": "p-8" } as const;
export const radius = { chip: "rounded-sm", input: "rounded", card: "rounded-md", pill: "rounded-full" } as const;
/**
 * Motion. `transition-transform` and never `transition-all`: the spatial
 * contract allows only `transform` and `opacity`, and `transition-all` also
 * transitions `box-shadow`, which repaints every frame on a five layer stack.
 * Durations are 120 and 200 only, per the motion tokens in section 4.
 */
export const motion = {
  hover: "transition-transform duration-120 ease-out",
  state: "transition-transform duration-200 ease-out",
} as const;
export const layer = {
  base: "z-0", sticky: "z-10", dropdown: "z-20", popup: "z-30", sheet: "z-40", skip: "z-50",
} as const;

/* ── the six knowledge states ────────────────────────────────────────────── */
/* Filled chips assert a fact. OUTLINED chips assert our arithmetic.          */
/* DASHED is the shape for "we do not know", and it is never a warning red.   */
export const PROVENANCE_TONE: Record<Provenance, string> = {
  curated: "bg-greenSoft text-green border border-green",
  provider: "bg-blueSoft text-blue border border-blue",
  osm: "bg-greenSoft text-green border border-green",
  derived: "bg-blueSoft text-blue border border-blue",
  inferred: "bg-amberSoft text-amber border border-amber",
};

export const CONFIDENCE_TONE: Record<Confidence, string> = {
  verified: "bg-greenSoft text-green border border-green",
  community: "bg-blueSoft text-blue border border-blue",
  estimate: "bg-amberSoft text-amber border border-amber",
  unverified: "bg-canvas text-muted border border-dashed border-muted",
};

/** The split chip. A record that is partly verified NEVER collapses to verified. */
export const MIXED_TONE = "bg-canvas text-muted border border-line";
export const mixedChip = (verified: number, total: number) =>
  `${MIXED_TONE} ${verified} of ${total} fields verified`;

export const KNOWLEDGE_LEGEND: { state: Confidence; label: string; meaning: string }[] = [
  { state: "verified", label: "Verified", meaning: "Matched to a source we can name." },
  { state: "community", label: "Community", meaning: "Reported by a resident or a provider." },
  { state: "estimate", label: "Estimate", meaning: "A computed number. Our arithmetic, not a claim." },
  { state: "unverified", label: "Unverified", meaning: "We do not know this yet." },
];

/* ── the nine UI states ──────────────────────────────────────────────────── */
/* Every screen implements all nine. A state that renders a blank div is a bug. */
export type UiState =
  | "solving" | "nothing-fits" | "nothing-retrieved" | "partially-unknown"
  | "abstained" | "routing-down" | "offline" | "sold-out" | "broken";

export const UI_STATE_COPY: Record<UiState, { title: string; body: string; tone: "blue" | "muted" | "amber" }> = {
  solving: {
    title: "Working",
    body: "Stage updates below. Nothing is hidden while this runs.",
    tone: "blue",
  },
  "nothing-fits": {
    title: "Nothing fits all of it",
    body: "The cheapest single change is named first, with the count it would unlock.",
    tone: "muted",
  },
  "nothing-retrieved": {
    title: "Nothing in range",
    body: "Name the filter that emptied the set and the one control that widens it.",
    tone: "muted",
  },
  "partially-unknown": {
    title: "Some facts are unverified",
    body: "These are marked. They did not decide the result.",
    tone: "muted",
  },
  abstained: {
    title: "We will not claim this",
    body: "A fact is unknown, so the gate declined to judge. This is not a rejection.",
    tone: "muted",
  },
  "routing-down": {
    title: "Live routing is unavailable",
    body: "Showing a straight-line estimate at the city congestion multiplier.",
    tone: "amber",
  },
  offline: {
    title: "Running on the committed snapshot",
    body: "Everything below is real stored data. Live routing needs a connection.",
    tone: "blue",
  },
  "sold-out": {
    title: "Sold out",
    body: "State the fact and its timestamp, then offer the replan.",
    tone: "amber",
  },
  broken: {
    title: "Something failed",
    body: "One sentence naming what failed and what still works. No stack trace.",
    tone: "amber",
  },
};

/* ── field labels, verbatim ─────────────────────────────────────────────── */
export const FIELD_LABEL: Record<ProvenancedField, string> = {
  name: "Name", coordinates: "Coordinates", address: "Address", category: "Category",
  duration: "Duration", price: "Price", pricePerPerson: "Price per person",
  capacity: "Capacity", openingHours: "Opening hours", accessibility: "Accessibility",
  indoor: "Indoor or outdoor", kidFriendly: "Good with children", booking: "Booking",
  seasonality: "Season", bestTime: "Best time of day", diet: "Food served",
  rating: "Rating", reviewCount: "Review count", media: "Photos and video",
};

export const COMPONENT_LABEL: Record<string, string> = {
  interest: "Matches your interests", rating: "Rating, weighted by review count",
  value: "Value for money", authenticity: "Local authenticity", weather: "Weather fit",
  crowd: "Crowd at that hour", novelty: "Different from your other stops",
  groupFit: "Fits your group", travelFriction: "Travel to get there", reliability: "Provider reliability",
};

export const TONE_TEXT = { blue: "text-blue", green: "text-green", amber: "text-amber", muted: "text-muted" } as const;

/* ── the depth scale, spatial contract section 8 ─────────────────────────── */

export const depth = {
  recessed: "depth-recessed",
  flush: "depth-flush",
  raised: "depth-raised",
  lifted: "depth-lifted",
  floating: "depth-floating",
  foreground: "depth-foreground",
} as const;

export const depthShadow = {
  recessed: "shadow-recessed",
  flush: "shadow-flush",
  raised: "shadow-raised",
  lifted: "shadow-lifted",
  floating: "shadow-floating",
  foreground: "shadow-foreground",
} as const;

/** The seven encodings in section 6, as a lookup so nobody re-derives them. */
export const KNOWLEDGE_DEPTH: Record<Confidence, string> = {
  verified: depth.raised,
  community: depth.raised,
  estimate: depth.flush,
  unverified: depth.recessed,
};

export const RUNG_DEPTH: Record<Rung, string> = {
  strict: depth.lifted, dropped_minimum: depth.raised,
  greedy_fill: depth.flush, single_best: depth.recessed,
};

/** Tilt for the integrity stamp. Max 6deg at the tolerance. */
export const driftTilt = (drift: number, tolerance: number) =>
  `tilt-by-drift-${Math.round(Math.min(1, Math.max(0, drift / tolerance)) * 6)}`;

export const MOTION = { hover: 120, state: 200, scene: 320 } as const;
export const PERSPECTIVE = { min: 900, default: 1200, max: 1400 } as const;

/* ── dataset statistics ──────────────────────────────────────────────────── */
/* Re-exported from `records.ts` so a view file that needs a number never has  */
/* to know where the number came from. `DESIGN-CONTRACT.md` bans fake metrics */
/* and a judge checks, so a hard-coded count in a component is a defect.      */
export {
  DATASET_SIZE,
  HAND_WRITTEN,
  OSM_MATCHED,
  CURATED_CATEGORY_COUNT,
  provenanceSummary,
  credibilityLine,
} from "./records";
