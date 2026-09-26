"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowSquareOut, Funnel, MapPin, NavigationArrow, X } from "@phosphor-icons/react/dist/ssr";
import { ExperienceMap } from "@/components/map";
import { BottomNav, StatusLabel } from "@/components/ui";
import { Footer } from "@/components/footer";
import { AddToPlanButton } from "@/components/plan-button";
import { WhyThis } from "@/components/ananta/why-this";
import { WhyNotThat } from "@/components/ananta/why-not-that";
import { ProvenanceLegend } from "@/components/ananta/provenance-badge";
import { LearnerSummary } from "@/components/ananta/learned-weights";
import { UiStatePanel } from "@/components/ananta/learning/ui-state";
import { ResultCard } from "@/components/ananta/explore/result-card";
import { PipelineStrip } from "@/components/ananta/explore/pipeline-strip";
import { ExclusionPanel } from "@/components/ananta/explore/exclusion-panel";
import { DEMO_ORIGIN, defaultEngineInput, useLearner, usePipeline, usePlanIds } from "@/components/ananta/use-ananta";
import type { ExperienceV2 } from "@/lib/engine";
import { inrLabel, type PipelineRun } from "@/components/ananta/pipeline";
import { parseDiscoveryIntent } from "@/lib/discovery";
import { formatDistance } from "@/lib/location";
import { fetchStreetRoute, type StreetRoute } from "@/lib/routing";
import { allExperiences, DATASET_CATEGORIES } from "@/lib/data";
import { zones as dataZones } from "@/lib/seed";

/**
 * Explore, on the engine.
 *
 * The pipeline order is retrieve, gate, score, and the score is never thrown
 * away. The old page gated and scored in one loop, then ran the quick filters as
 * a second gate *after* ranking, so excluded records were scored, sorted, and
 * their score dropped on the floor. It also printed `reasons.slice(0, 3)`, a
 * fixed `if` ladder, and told the traveller "with no filters, nearest places
 * rank first" while a score tie beyond 10 km was broken alphabetically.
 *
 * `lib/recommendation.ts` and `lib/quick-filters.ts` are not imported here. The
 * facets they carried are now either retrieve facets (category, city, zone,
 * free, community sourced, best time) or hard gates with a typed `Rejection`
 * (budget, window, weather, travel). The second, post-ranking gate is gone.
 */

const categories = ["All", ...DATASET_CATEGORIES] as const;
const zones = ["All", ...dataZones] as const;
const PAGE_SIZE = 24;
const BULK_CAP = 12;

type City = "All" | "Mumbai" | "Navi Mumbai";
type Category = (typeof categories)[number];
type Zone = (typeof zones)[number];
type SortKey = "rank" | "price" | "duration" | "name";
type BestTime = "any" | "morning" | "afternoon" | "evening" | "night";

const BEST_TIME_OPTIONS: { value: BestTime; label: string }[] = [
  { value: "any", label: "Any time of day" },
  { value: "morning", label: "Best in the morning" },
  { value: "afternoon", label: "Best in daylight" },
  { value: "evening", label: "Best after sunset" },
  { value: "night", label: "Best after dark" },
];

const BUDGET_OPTIONS = [
  { label: "Any budget", value: undefined },
  { label: "Under ₹300", value: 300 },
  { label: "Under ₹500", value: 500 },
  { label: "Under ₹800", value: 800 },
  { label: "Under ₹1200", value: 1200 },
] as const;

const TIME_OPTIONS = [
  { label: "Any time I have", value: undefined },
  { label: "Up to 60 min", value: 60 },
  { label: "Up to 90 min", value: 90 },
  { label: "Up to 2 hours", value: 120 },
  { label: "Up to 3 hours", value: 180 },
] as const;

const BUDGET_LABELS: Record<number, string> = { 300: "Under ₹300", 500: "Under ₹500", 800: "Under ₹800", 1200: "Under ₹1200" };
const TIME_LABELS: Record<number, string> = { 60: "Up to 60 min", 90: "Up to 90 min", 120: "Up to 2 hours", 180: "Up to 3 hours" };

export default function ExplorePage() {
  const [learner] = useLearner();
  const [planIds, , hasInPlan, togglePlan] = usePlanIds();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState<City>("All");
  const [category, setCategory] = useState<Category>("All");
  const [zone, setZone] = useState<Zone>("All");
  const [maxPrice, setMaxPrice] = useState<number>();
  const [availableMinutes, setAvailableMinutes] = useState<number>();
  const [rainMode, setRainMode] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const [communityOnly, setCommunityOnly] = useState(false);
  const [bestTime, setBestTime] = useState<BestTime>("any");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sort, setSort] = useState<SortKey>("rank");
  const [route, setRoute] = useState<StreetRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeFailed, setRouteFailed] = useState(false);

  // Typing in a filter must not block the main thread, so the solve runs
  // against a deferred copy of the input.
  const deferredQuery = useDeferredValue(query);
  const deferredMinutes = useDeferredValue(availableMinutes);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get("q");
    if (initial) {
      setQuery(initial);
      applyIntentTo(initial, { setCity, setCategory, setMaxPrice, setAvailableMinutes, setRainMode });
    }
    if (params.get("gems") === "1") setCommunityOnly(true);
    if (params.get("free") === "1") setFreeOnly(true);
    const walkable = params.get("walkable") === "1";
    if (walkable) setAvailableMinutes(30);
    const best = params.get("bestTime");
    const matched = BEST_TIME_OPTIONS.find((option) => encodeURIComponent(option.label) === best);
    if (matched) setBestTime(matched.value);
    const cityParam = params.get("city");
    if (cityParam === "Mumbai" || cityParam === "Navi Mumbai") setCity(cityParam);
  }, []);

  const input = useMemo(
    () =>
      defaultEngineInput({
        query: deferredQuery,
        cityId: city === "Navi Mumbai" ? "navi-mumbai" : "mumbai",
        category,
        zone,
        budgetInr: maxPrice ?? 1500,
        availableMinutes: deferredMinutes ?? 240,
        rainMode,
        freeOnly,
        communityOnly,
        bestTimeOfDay: bestTime,
        planIds,
      }),
    [bestTime, category, city, communityOnly, deferredMinutes, deferredQuery, freeOnly, maxPrice, planIds, rainMode, zone],
  );

  const run = usePipeline(input, learner.weights);

  const ranked = useMemo(() => run?.ranked ?? [], [run]);
  const rows = useMemo(() => {
    if (sort === "rank") {
      // The engine sorts by objective then record id. With few or no constraints
      // many records can tie on the objective, and an alphabetical tiebreak is
      // not a ranking, so distance breaks the tie here in the view layer. The
      // row exposes travelKm precisely so this is possible without reimplementing
      // a distance function.
      return [...ranked].sort(
        (a, b) =>
          b.objective.value - a.objective.value ||
          a.travelKm - b.travelKm ||
          a.record.id.localeCompare(b.record.id),
      );
    }
    const copy = [...ranked];
    if (sort === "price") copy.sort((a, b) => a.record.priceInr - b.record.priceInr || a.record.id.localeCompare(b.record.id));
    else if (sort === "duration") copy.sort((a, b) => a.record.durationMinutes - b.record.durationMinutes || a.record.id.localeCompare(b.record.id));
    else copy.sort((a, b) => a.record.name.localeCompare(b.record.name));
    return copy;
  }, [ranked, sort]);

  const paged = rows.slice(0, visibleCount);
  const selected = useMemo(() => {
    const hit = ranked.find((row) => row.record.id === selectedId);
    return hit ?? ranked[0] ?? null;
  }, [ranked, selectedId]);

  const visibleRecords = useMemo(() => paged.map((row) => row.record), [paged]);
  const excludedCount = (run?.retrievalCount ?? 0) - (run?.gated.passed.length ?? 0);
  // Refused records, so their map pins recede. Only the ones the gate actually
  // dropped, read from the run, never re-derived here.
  const rejectedIds = useMemo(
    () => (run?.gated.rejected ?? []).map((row) => row.record.id),
    [run],
  );
  // The rain filter is the only weather signal this screen carries, and it is a
  // mode rather than a severity, so it maps to the lightest wet case. The map
  // desaturates on it; it never claims a forecast it was not given.
  const weather = rainMode ? "rain" : "clear";
  // The honest count of "we do not know" across what is on screen, not the whole
  // catalogue, so it tracks the page the traveller is actually looking at.
  const advisoryCount = useMemo(
    () => paged.reduce((sum, row) => sum + row.advisory.length, 0),
    [paged],
  );

  const selectExperience = useCallback((id: string) => setSelectedId(id), []);
  const clear = useCallback(() => {
    setCity("All");
    setCategory("All");
    setZone("All");
    setMaxPrice(undefined);
    setAvailableMinutes(undefined);
    setRainMode(false);
    setFreeOnly(false);
    setCommunityOnly(false);
    setBestTime("any");
    setQuery("");
    setVisibleCount(PAGE_SIZE);
  }, []);

  const hasConstraints =
    city !== "All" || category !== "All" || zone !== "All" || maxPrice !== undefined ||
    availableMinutes !== undefined || rainMode || freeOnly || communityOnly || bestTime !== "any" || Boolean(query);

  // The real walking route from the fixed demo position to the selection. A
  // rejected fetch and a straight-line fallback are different states, so the
  // failure is tracked rather than collapsed into "no route".
  useEffect(() => {
    const id = selected?.record.id;
    if (!id) {
      setRoute(null);
      setRouteFailed(false);
      return;
    }
    const target = allExperiences.find((place) => place.id === id);
    if (!target) {
      setRoute(null);
      setRouteFailed(false);
      return;
    }
    let cancelled = false;
    setRouteLoading(true);
    setRoute(null);
    setRouteFailed(false);
    fetchStreetRoute(DEMO_ORIGIN.coordinates, target.coordinates)
      .then((result) => {
        if (!cancelled) {
          setRoute(result);
          setRouteLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRouteFailed(true);
          setRouteLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.record.id]);

  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-[1480px] bg-white lg:my-5 lg:rounded-[28px] lg:shadow-card">
        <Header city={city} setCity={setCity} />
        <div className="flex flex-col">
          <section className="relative h-[540px] overflow-hidden sm:h-[620px] lg:h-[720px]">
            <ExperienceMap
              records={visibleRecords}
              selectedId={selected?.record.id}
              onSelect={selectExperience}
              route={route}
              rejectedIds={rejectedIds}
              weather={weather}
            />
            <SearchOverlay
              query={query}
              setQuery={setQuery}
              applyIntent={(text) => applyIntentTo(text, { setCity, setCategory, setMaxPrice, setAvailableMinutes, setRainMode })}
              city={city}
              setCity={setCity}
              category={category}
              setCategory={setCategory}
              zone={zone}
              setZone={setZone}
              maxPrice={maxPrice}
              setMaxPrice={setMaxPrice}
              availableMinutes={availableMinutes}
              setAvailableMinutes={setAvailableMinutes}
              rainMode={rainMode}
              setRainMode={setRainMode}
              freeOnly={freeOnly}
              setFreeOnly={setFreeOnly}
              communityOnly={communityOnly}
              setCommunityOnly={setCommunityOnly}
              bestTime={bestTime}
              setBestTime={setBestTime}
            />
          </section>

          <aside className="border-t border-line bg-white p-5 sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Engine output</p>
                <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em]">Ranked matches</h2>
                <div className="mt-2 max-w-[68ch]">
                  <PipelineStrip run={run} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-muted">
                  Sort
                  <select
                    aria-label="Sort results"
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortKey)}
                    className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm font-bold normal-case tracking-normal text-ink"
                  >
                    <option value="rank">Best match</option>
                    <option value="price">Price: low to high</option>
                    <option value="duration">Shortest time</option>
                    <option value="name">Name A to Z</option>
                  </select>
                </label>
                <span className="text-sm font-semibold text-muted">{ranked.length} results</span>
              </div>
            </div>

            {hasConstraints && (
              <ConstraintSummary
                city={city}
                category={category}
                zone={zone}
                maxPrice={maxPrice}
                availableMinutes={availableMinutes}
                rainMode={rainMode}
                freeOnly={freeOnly}
                communityOnly={communityOnly}
                bestTime={bestTime}
                clear={clear}
              />
            )}

            <ProvenanceLegend />
            <div className="mt-3">
              <LearnerSummary learner={learner} />
            </div>

            {advisoryCount > 0 && (
              <div className="mt-4">
                <UiStatePanel state="partially-unknown">
                  <p className="mt-2 max-w-[68ch] text-sm leading-6">
                    {advisoryCount} advisory note{advisoryCount === 1 ? "" : "s"} on the results below. They name
                    the facts we could not verify, and they are marked on each card. They did not decide the
                    ranking, and nothing was refused on them.
                  </p>
                </UiStatePanel>
              </div>
            )}

            {/* The 3D stage. `perspective` lives on `.stage` and `preserve-3d`
                on the grid, so every card's translateZ is measured against one
                shared vanishing point. Without the shared stage each card would
                establish its own and the grid would read as a wobble rather than
                a surface. Exactly one card is lifted: the top result. */}
            <div className="stage mt-6">
              <div className="stage-3d grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {paged.map((row, index) => (
                  <ResultCard
                    key={row.record.id}
                    row={row}
                    isTop={index === 0}
                    inPlan={hasInPlan(row.record.id)}
                    onTogglePlan={togglePlan}
                    onSelect={selectExperience}
                    originArea={DEMO_ORIGIN.area}
                  />
                ))}
              </div>
            </div>

            {visibleCount < rows.length && (
              <button
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="mt-4 w-full border border-line py-3 text-sm font-bold text-blue transition-colors hover:border-blue"
              >
                Show more ({rows.length - visibleCount} remaining)
              </button>
            )}

            {!ranked.length && run && <EmptyState run={run} onClear={clear} />}

            {run && run.gated.rejected.length > 0 && (
              <ExclusionPanel rows={run.gated.rejected} cheapest={run.cheapest} cap={BULK_CAP} />
            )}

            {selected && (
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <WhyNotThat
                  recordName={selected.record.name}
                  rejections={selected.advisory}
                  cheapest={run?.cheapest ?? null}
                  retrievalNote={`${selected.record.name} passed the gate. The list below is what we do not know about it.`}
                  bulkCount={excludedCount}
                />
                <WhyThis
                  components={selected.components}
                  total={selected.objective.value}
                  limit={7}
                  note="This is the ranking score, so a low number can still be the best on offer."
                />
              </div>
            )}

            {selected && <Selection record={selected.record} inPlan={hasInPlan(selected.record.id)} onToggle={togglePlan} planCount={planIds.length} />}
            {selected && <DirectionsPanel route={route} loading={routeLoading} failed={routeFailed} />}
          </aside>
        </div>
        <Footer />
        <BottomNav />
      </div>
    </main>
  );
}

function applyIntentTo(
  text: string,
  setters: {
    setCity: (value: City) => void;
    setCategory: (value: Category) => void;
    setMaxPrice: (value: number | undefined) => void;
    setAvailableMinutes: (value: number | undefined) => void;
    setRainMode: (value: boolean) => void;
  },
) {
  const intent = parseDiscoveryIntent(text);
  if (intent.city) setters.setCity(intent.city);
  if (intent.category && categories.includes(intent.category as Category)) setters.setCategory(intent.category as Category);
  setters.setMaxPrice(intent.maxPrice);
  setters.setAvailableMinutes(intent.availableMinutes);
  if (intent.weather) setters.setRainMode(true);
}

function Header({ city, setCity }: { city: City; setCity: (city: City) => void }) {
  return (
    <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
      <a href="/" className="flex items-center gap-2 text-sm font-bold">
        <ArrowLeft size={18} /> Home
      </a>
      <h1 className="text-lg font-bold">Explore</h1>
      <button
        onClick={() => setCity(city === "Navi Mumbai" ? "Mumbai" : "Navi Mumbai")}
        className="rounded-lg border border-line px-3 py-2 text-sm font-semibold"
      >
        {city === "Navi Mumbai" ? "Show Mumbai" : "Show Navi Mumbai"}
      </button>
    </header>
  );
}

function SearchOverlay({
  query, setQuery, applyIntent,
  city, setCity, category, setCategory, zone, setZone,
  maxPrice, setMaxPrice, availableMinutes, setAvailableMinutes, rainMode, setRainMode,
  freeOnly, setFreeOnly, communityOnly, setCommunityOnly, bestTime, setBestTime,
}: {
  query: string;
  setQuery: (value: string) => void;
  applyIntent: (value: string) => void;
  city: City;
  setCity: (value: City) => void;
  category: Category;
  setCategory: (value: Category) => void;
  zone: Zone;
  setZone: (value: Zone) => void;
  maxPrice?: number;
  setMaxPrice: (value: number | undefined) => void;
  availableMinutes?: number;
  setAvailableMinutes: (value: number | undefined) => void;
  rainMode: boolean;
  setRainMode: (value: boolean) => void;
  freeOnly: boolean;
  setFreeOnly: (value: boolean) => void;
  communityOnly: boolean;
  setCommunityOnly: (value: boolean) => void;
  bestTime: BestTime;
  setBestTime: (value: BestTime) => void;
}) {
  // Collapsed in the server render so there is no hydration mismatch, then
  // opened on mount for wide screens.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(window.innerWidth >= 1024);
  }, []);
  const activeCount =
    (city !== "All" ? 1 : 0) + (category !== "All" ? 1 : 0) + (zone !== "All" ? 1 : 0) +
    (maxPrice !== undefined ? 1 : 0) + (availableMinutes !== undefined ? 1 : 0) +
    (rainMode ? 1 : 0) + (freeOnly ? 1 : 0) + (communityOnly ? 1 : 0) + (bestTime !== "any" ? 1 : 0);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        applyIntent(query);
      }}
      className="absolute left-5 right-5 top-5 sm:left-8 sm:right-8 sm:top-8"
    >
      <div className="flex items-center gap-3 rounded-xl border border-white/80 bg-white px-4 py-3 shadow-card">
        <MapPin size={18} className="shrink-0 text-blue" weight="fill" />
        <input
          aria-label="Search experiences"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
          placeholder="Food under ₹800 in Mumbai"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {/* The funnel toggles the panel below it. It used to have no handler. */}
        <button
          type="button"
          aria-label={open ? "Hide filters" : "Show filters"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="text-muted"
        >
          <Funnel size={18} weight={open ? "fill" : "regular"} />
        </button>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold ${activeCount > 0 ? "border-blue bg-blueSoft/60 text-blue" : "border-line text-ink"}`}
        >
          <Funnel size={14} /> Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
        </button>
      </div>
      {open && (
        <div className="mt-3 max-h-[62vh] space-y-4 overflow-y-auto rounded-xl border border-white/80 bg-white/95 p-4 shadow-card backdrop-blur-sm">
          <FilterGroup label="Where">
            <FilterButton active={city === "All"} onClick={() => setCity("All")}>All cities</FilterButton>
            <FilterButton active={city === "Mumbai"} onClick={() => setCity("Mumbai")}>Mumbai</FilterButton>
            <FilterButton active={city === "Navi Mumbai"} onClick={() => setCity("Navi Mumbai")}>Navi Mumbai</FilterButton>
            <select aria-label="Filter by zone" value={zone} onChange={(event) => setZone(event.target.value as Zone)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold">
              <option value="All">All zones</option>
              {zones.slice(1).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </FilterGroup>
          <FilterGroup label="What">
            <FilterButton active={category === "All"} onClick={() => setCategory("All")}>Everything</FilterButton>
            {categories.slice(1).map((item) => (
              <FilterButton key={item} active={category === item} onClick={() => setCategory(category === item ? "All" : item)}>
                {item}
              </FilterButton>
            ))}
          </FilterGroup>
          <FilterGroup label="Budget and time">
            <select aria-label="Filter by budget" value={maxPrice ?? ""} onChange={(event) => setMaxPrice(event.target.value === "" ? undefined : Number(event.target.value))} className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold">
              {BUDGET_OPTIONS.map((item) => (
                <option key={item.label} value={item.value ?? ""}>{item.label}</option>
              ))}
            </select>
            <select aria-label="Filter by time available" value={availableMinutes ?? ""} onChange={(event) => setAvailableMinutes(event.target.value === "" ? undefined : Number(event.target.value))} className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold">
              {TIME_OPTIONS.map((item) => (
                <option key={item.label} value={item.value ?? ""}>{item.label}</option>
              ))}
            </select>
            <FilterButton active={rainMode} onClick={() => setRainMode(!rainMode)}>Rain-ready (indoor)</FilterButton>
          </FilterGroup>
          <FilterGroup label="When">
            <select aria-label="Filter by best time" value={bestTime} onChange={(event) => setBestTime(event.target.value as BestTime)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold">
              {BEST_TIME_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </FilterGroup>
          <FilterGroup label="Vibe">
            <FilterButton active={communityOnly} onClick={() => setCommunityOnly(!communityOnly)}>Community sourced</FilterButton>
            <FilterButton active={freeOnly} onClick={() => setFreeOnly(!freeOnly)}>Free entry</FilterButton>
            <FilterButton active={availableMinutes === 30} onClick={() => setAvailableMinutes(availableMinutes === 30 ? undefined : 30)}>
              Walkable in 30 min
            </FilterButton>
          </FilterGroup>
        </div>
      )}
    </form>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-bold ${active ? "bg-blue text-white" : "border border-line bg-white"}`}>
      {children}
    </button>
  );
}

function ConstraintSummary({
  city, category, zone, maxPrice, availableMinutes, rainMode, freeOnly, communityOnly, bestTime, clear,
}: {
  city: City;
  category: Category;
  zone: Zone;
  maxPrice?: number;
  availableMinutes?: number;
  rainMode: boolean;
  freeOnly: boolean;
  communityOnly: boolean;
  bestTime: BestTime;
  clear: () => void;
}) {
  const labels = [
    city !== "All" && city,
    category !== "All" && category,
    zone !== "All" && zone,
    maxPrice !== undefined && (BUDGET_LABELS[maxPrice] ?? `Under ₹${maxPrice}`),
    availableMinutes !== undefined && (TIME_LABELS[availableMinutes] ?? `${availableMinutes} minutes`),
    rainMode && "Rain-ready",
    communityOnly && "Community sourced",
    freeOnly && "Free entry",
    bestTime !== "any" && BEST_TIME_OPTIONS.find((option) => option.value === bestTime)?.label,
  ].filter(Boolean);
  return (
    <div className="mt-5 border border-line bg-canvas p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Applied constraints</p>
        <button aria-label="Clear filters" onClick={clear}>
          <X size={16} />
        </button>
      </div>
      <p className="mt-2 text-sm leading-6">{labels.join(" · ") || "Search text only"}</p>
    </div>
  );
}

/**
 * The empty state, split by which stage emptied the set.
 *
 * `nothing-retrieved` and `nothing-fits` are different failures with different
 * fixes, so they are different states. Retrieval returning nothing means the
 * query or the range is wrong, and the honest thing is to name which and say
 * what to widen. A full retrieval that the gate refused means the constraints
 * are contradictory, and the honest thing is to name the cheapest single
 * relaxation and how much it would unlock.
 *
 * `abstained` covers the case the design thesis is about: the gate met a fact
 * it could not verify and declined to judge. That is not a rejection and must
 * not be dressed as one.
 */
function EmptyState({ run, onClear }: { run: PipelineRun; onClear: () => void }) {
  if (run.retrievalCount === 0) {
    return (
      <div className="mt-6">
        <UiStatePanel state="nothing-retrieved">
          <p className="mt-2 max-w-[68ch] text-sm leading-6">
            {run.dominant
              ? run.dominant.sentence
              : "The search terms matched nothing inside your travel window. Widen the time filter or clear the category to see more."}
          </p>
        </UiStatePanel>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <UiStatePanel state="nothing-fits">
        {run.cheapest ? (
          <p className="mt-2 max-w-[68ch] text-sm leading-6">
            The cheapest single change is{" "}
            <span className="font-bold text-ink">{run.cheapest.label}</span>, which would bring back{" "}
            {run.cheapest.unlockedCount.toLocaleString("en-IN")} record
            {run.cheapest.unlockedCount === 1 ? "" : "s"}.
          </p>
        ) : (
          <p className="mt-2 max-w-[68ch] text-sm leading-6">
            {run.dominant?.sentence ?? "Every candidate was dropped before it could be scored."}
          </p>
        )}
        <button
          type="button"
          onClick={onClear}
          className="mt-4 inline-flex min-h-[44px] items-center border border-blue px-4 py-2 text-sm font-bold text-blue"
        >
          Clear the filters
        </button>
      </UiStatePanel>

      {run.byCode.length > 0 && (
        <UiStatePanel state="abstained">
          <ul className="mt-2 max-w-[68ch] space-y-1 text-sm leading-6">
            {run.byCode.slice(0, 4).map((row) => (
              <li key={row.code}>
                <span className="font-bold text-ink">{row.code.replace(/_/g, " ")}</span>{" "}
                <span className="text-muted">
                  refused {row.count.toLocaleString("en-IN")} record{row.count === 1 ? "" : "s"}
                  {row.blocking > 0 ? `, ${row.blocking} of them blocking` : ", advisory only"}
                </span>
              </li>
            ))}
          </ul>
        </UiStatePanel>
      )}
    </div>
  );
}

function Selection({
  record,
  inPlan,
  onToggle,
  planCount,
}: {
  record: ExperienceV2;
  inPlan: boolean;
  onToggle: (id: string) => void;
  planCount: number;
}) {
  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Current selection</p>
          <p className="mt-1 font-bold">{record.name}</p>
        </div>
        <span className="text-sm font-bold">{record.priceInr === 0 ? "Free" : inrLabel(record.priceInr)}</span>
      </div>
      {/* One add-to-plan implementation, the same toggle the detail page uses. */}
      <div className="mt-4">
        <AddToPlanButton experienceId={record.id} onToggle={onToggle} forced={inPlan} />
      </div>
      <a href={`/experience/${record.id}`} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-line px-4 py-3 text-sm font-bold text-blue transition-colors hover:border-blue">
        Open the full place page <ArrowSquareOut size={16} />
      </a>
      <p className="mt-2 text-center text-xs text-muted">
        Photos, video, About, field-by-field provenance, and turn-by-turn directions live there.
      </p>
      {planCount > 0 && (
        <a href="/trips" className="mt-3 block text-center text-xs font-bold text-green">
          {planCount} experience{planCount === 1 ? "" : "s"} in your draft plan
        </a>
      )}
    </div>
  );
}

function DirectionsPanel({
  route,
  loading,
  failed,
}: {
  route: StreetRoute | null;
  loading: boolean;
  failed: boolean;
}) {
  // A straight-line fallback, a dead router and a failed request are three
  // different things, so they get three different sentences. Collapsing them
  // into "no directions" is how a product ends up quietly claiming it has none.
  const estimateOnly = Boolean(route && route.kind !== "street");
  const noRoute = !loading && !route && !failed;

  return (
    <section className="mt-6 border border-line p-5" aria-live="polite">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Directions</p>
          <h3 className="mt-2 text-lg font-bold">Walking from {DEMO_ORIGIN.label}</h3>
        </div>
        <NavigationArrow size={20} className="text-blue" />
      </div>
      {loading && <p className="mt-3 text-sm text-muted">Finding the walking route on the map...</p>}
      {failed && (
        <div className="mt-3">
          <UiStatePanel state="broken">
            <p className="mt-2 text-sm leading-6">
              The walking route request failed. The distance and duration are not shown because we did not get
              them. Everything else on this page is unaffected.
            </p>
          </UiStatePanel>
        </div>
      )}
      {noRoute && (
        <div className="mt-3">
          <UiStatePanel state="offline">
            <p className="mt-2 text-sm leading-6">
              Directions need the routing service. The gate, the ranking and the facts on this page are all from
              the committed snapshot and work without a connection.
            </p>
          </UiStatePanel>
        </div>
      )}
      {!loading && route && (
        <div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-bold">{formatDistance(route.distanceKm)}</span>
            <span className="text-muted">about {route.durationMinutes} min walk</span>
            <StatusLabel tone={route.kind === "street" ? "green" : "amber"}>
              {route.kind === "street" ? "Street route" : "Estimate only"}
            </StatusLabel>
          </div>
          {estimateOnly && (
            <div className="mt-3">
              <UiStatePanel state="routing-down">
                <p className="mt-2 text-sm leading-6">
                  This is a straight-line estimate at the city congestion multiplier, not a street route. No turn
                  by turn directions are claimed.
                </p>
              </UiStatePanel>
            </div>
          )}
          <p className="mt-2 text-xs leading-5 text-muted">{route.note}</p>
          {route.steps.length > 0 && (
            <ol className="mt-4 space-y-2 border-t border-line pt-4">
              {route.steps.map((step, index) => (
                <li key={`${step.instruction}-${index}`} className="flex gap-3 text-sm">
                  <span className="w-5 shrink-0 text-right text-xs font-bold text-blue">{index + 1}</span>
                  <span>
                    <span className="font-bold">{step.instruction}</span>
                    {step.streetName ? ` onto ${step.streetName}` : ""}
                    <span className="text-muted">
                      {" · "}
                      {step.distanceMeters >= 1000 ? `${(step.distanceMeters / 1000).toFixed(1)} km` : `${step.distanceMeters} m`}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

