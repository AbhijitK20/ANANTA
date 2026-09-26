"use client";

import { Funnel, X } from "@phosphor-icons/react/dist/ssr";
import { Chip, FacetGroup, Toggle } from "@/components/ananta/explore/controls";
import { PLAN_BUFFER_MINUTES } from "@/components/ananta/pipeline";
import { DATASET_CATEGORIES } from "@/lib/data";
import { zones as dataZones } from "@/lib/seed";

/**
 * The filter panel, floating over the map in glass.
 *
 * **The glass is functional, not decorative.** The panel sits on top of a live
 * map, so it needs its own scrim or the tiles underneath decide the contrast of
 * every label in it. One `backdrop-blur` on one panel is that scrim. It is not
 * repeated across the screen, because `DESIGN-CONTRACT.md:24` bans decorative
 * glassmorphism and this is the one place where a translucent surface solves a
 * real problem.
 *
 * **The walking radius is the honest headline of this panel.** The engine
 * prefilters on an isochrone before anything else runs, so the one number that
 * decides what the traveller sees at all gets its own group, its own live count,
 * and a statement of exactly what it is:
 *
 *   - it is a walking-time estimate, not a measured route,
 *   - it is straight-line distance raised by a street factor, at the city's
 *     walking congestion, and
 *   - the same number is the time the gate checks each place against, so
 *     widening it widens the day as well as the map.
 *
 * That last point used to be invisible. A radius that quietly changes the gate is
 * a filter that lies about itself, so the buffer is named rather than implied.
 *
 * The counts in this panel are read off the run, never typed. "Anything at all"
 * is a real option only where the engine treats it as one.
 */

export type CityChoice = "All" | "Mumbai" | "Navi Mumbai";

/** The three city facets, as the manifest names them. */
export const CITY_OPTIONS: { value: CityChoice; label: string }[] = [
  { value: "All", label: "All cities" },
  { value: "Mumbai", label: "Mumbai" },
  { value: "Navi Mumbai", label: "Navi Mumbai" },
];

export const BUDGET_OPTIONS = [
  { label: "Any budget", value: undefined },
  { label: "Under ₹300", value: 300 },
  { label: "Under ₹500", value: 500 },
  { label: "Under ₹800", value: 800 },
  { label: "Under ₹1200", value: 1200 },
] as const;

export const BUDGET_LABELS: Record<number, string> = {
  300: "Under ₹300",
  500: "Under ₹500",
  800: "Under ₹800",
  1200: "Under ₹1200",
};

/**
 * The walking budget, in minutes, from a short walk to a long day out.
 *
 * The last entry is the engine's own default, so an untouched panel shows a real
 * active value rather than a control that claims "anything" while quietly
 * applying four hours.
 */
export const WALK_OPTIONS = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "90 min", value: 90 },
  { label: "2 hours", value: 120 },
  { label: "3 hours", value: 180 },
  { label: "4 hours", value: 240 },
] as const;

/** What the engine uses when the traveller has not chosen. Kept in one place. */
export const DEFAULT_WALK_MINUTES = 240;

export const WALK_LABELS: Record<number, string> = Object.fromEntries(
  WALK_OPTIONS.map((option) => [option.value, option.label]),
) as Record<number, string>;

export const BEST_TIME_OPTIONS = [
  { value: "any", label: "Any time" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Daylight" },
  { value: "evening", label: "After sunset" },
  { value: "night", label: "After dark" },
] as const;

export type BestTime = (typeof BEST_TIME_OPTIONS)[number]["value"];

const CATEGORY_OPTIONS = ["All", ...DATASET_CATEGORIES] as const;
const ZONE_OPTIONS = ["All", ...dataZones] as const;

const SELECT =
  "w-full rounded border border-line bg-white px-3 py-2 text-sm font-bold text-ink hover:border-blue";

type Props = {
  open: boolean;
  onClose: () => void;
  activeCount: number;
  onClear: () => void;
  city: CityChoice;
  setCity: (value: CityChoice) => void;
  category: (typeof CATEGORY_OPTIONS)[number];
  setCategory: (value: (typeof CATEGORY_OPTIONS)[number]) => void;
  zone: string;
  setZone: (value: string) => void;
  budget: number | undefined;
  setBudget: (value: number | undefined) => void;
  walkMinutes: number;
  setWalkMinutes: (value: number) => void;
  bestTime: BestTime;
  setBestTime: (value: BestTime) => void;
  rainMode: boolean;
  setRainMode: (value: boolean) => void;
  freeOnly: boolean;
  setFreeOnly: (value: boolean) => void;
  communityOnly: boolean;
  setCommunityOnly: (value: boolean) => void;
  /** Places inside the current walking radius, read off the run. */
  inRadius: number;
  originLabel: string;
  /** True before the first run lands, so the count is never a stale zero. */
  solving: boolean;
};

export function FilterPanel(props: Props) {
  const {
    open,
    onClose,
    activeCount,
    onClear,
    city,
    setCity,
    category,
    setCategory,
    zone,
    setZone,
    budget,
    setBudget,
    walkMinutes,
    setWalkMinutes,
    bestTime,
    setBestTime,
    rainMode,
    setRainMode,
    freeOnly,
    setFreeOnly,
    communityOnly,
    setCommunityOnly,
    inRadius,
    originLabel,
    solving,
  } = props;

  if (!open) return null;

  return (
    <div
      id="explore-filters"
      className="absolute left-4 right-4 top-[4.75rem] z-20 max-h-[min(58vh,26rem)] overflow-y-auto rounded-lg border border-white/70 bg-white/90 p-4 shadow-floating backdrop-blur-md lg:left-5 lg:right-auto lg:top-20 lg:max-h-[calc(100%_-_7.5rem)] lg:w-[23rem]"
      aria-label="Filters"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-ink">
          <Funnel size={14} aria-hidden="true" className="text-blue" />
          Filters
          <span className="font-semibold normal-case tracking-normal text-muted">
            {activeCount === 0 ? "nothing applied" : `${activeCount} applied`}
          </span>
        </p>
        <div className="flex items-center gap-1">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="rounded px-2 py-1 text-[11px] font-bold text-blue hover:bg-blueSoft"
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide filters"
            className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-canvas hover:text-ink"
          >
            <X size={15} weight="bold" />
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <FacetGroup label="Where">
          {CITY_OPTIONS.map((option) => (
            <Chip key={option.value} active={city === option.value} onClick={() => setCity(option.value)}>
              {option.label}
            </Chip>
          ))}
          <select
            aria-label="Filter by neighbourhood"
            className={SELECT}
            value={zone}
            onChange={(event) => setZone(event.target.value)}
          >
            {ZONE_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item === "All" ? "Every neighbourhood" : item}
              </option>
            ))}
          </select>
        </FacetGroup>

        <FacetGroup label="What you are after">
          {CATEGORY_OPTIONS.map((item) => (
            <Chip
              key={item}
              active={category === item}
              onClick={() => setCategory(category === item ? "All" : item)}
            >
              {item === "All" ? "Everything" : item}
            </Chip>
          ))}
        </FacetGroup>

        <FacetGroup
          label="How far you will walk"
          note={
            <>
              Estimated, not measured: straight-line distance with a street factor, at the city&apos;s walking
              congestion. The same number is your time budget, so each place is checked on travel plus visit plus a{" "}
              {PLAN_BUFFER_MINUTES} minute buffer. It is the search radius around {originLabel}.
            </>
          }
        >
          {WALK_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              active={walkMinutes === option.value}
              onClick={() => setWalkMinutes(option.value)}
            >
              {option.label}
            </Chip>
          ))}
          <p className="w-full text-[11px] font-semibold text-muted" aria-live="polite">
            {solving
              ? "Working out what sits inside that radius."
              : `${inRadius.toLocaleString("en-IN")} places sit inside this walking radius right now.`}
          </p>
        </FacetGroup>

        <FacetGroup label="Budget">
          <select
            aria-label="Filter by budget"
            className={SELECT}
            value={budget ?? ""}
            onChange={(event) => setBudget(event.target.value === "" ? undefined : Number(event.target.value))}
          >
            {BUDGET_OPTIONS.map((item) => (
              <option key={item.label} value={item.value ?? ""}>
                {item.label}
              </option>
            ))}
          </select>
        </FacetGroup>

        <FacetGroup label="When">
          {BEST_TIME_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              active={bestTime === option.value}
              onClick={() => setBestTime(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </FacetGroup>

        <FacetGroup label="Preferences">
          <div className="grid w-full gap-1.5">
            <Toggle
              checked={rainMode}
              onChange={setRainMode}
              label="It is raining"
              hint="Keeps the outdoor places out and never claims a forecast."
            />
            <Toggle
              checked={freeOnly}
              onChange={setFreeOnly}
              label="Free entry only"
              hint="Filters on the price tag, which is an estimate for most of the catalogue."
            />
            <Toggle
              checked={communityOnly}
              onChange={setCommunityOnly}
              label="Community sourced only"
              hint="Reported by a resident or a provider, rather than generated."
            />
          </div>
        </FacetGroup>
      </div>
    </div>
  );
}
