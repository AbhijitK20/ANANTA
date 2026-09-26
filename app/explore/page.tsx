"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowSquareOut, Funnel, MapPin, NavigationArrow } from "@phosphor-icons/react/dist/ssr";
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
import { ActiveChip } from "@/components/ananta/explore/controls";
import {
  BEST_TIME_OPTIONS,
  BUDGET_LABELS,
  DEFAULT_WALK_MINUTES,
  FilterPanel,
  WALK_LABELS,
  type BestTime,
  type CityChoice,
} from "@/components/ananta/explore/filter-panel";
import { DEMO_ORIGIN, defaultEngineInput, useLearner, usePipeline, usePlanIds } from "@/components/ananta/use-ananta";
import type { ExperienceV2 } from "@/lib/engine";
import { inrLabel, type PipelineRun } from "@/components/ananta/pipeline";
import { parseDiscoveryIntent } from "@/lib/discovery";
import { formatDistance } from "@/lib/location";
import { fetchStreetRoute, type StreetRoute } from "@/lib/routing";
import { DATASET_CATEGORIES } from "@/lib/data";

/**
 * Explore, on the engine, as a map and list workspace.
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
 *
 * **The layout is a workspace, not a page.** On a wide screen the map holds the
 * left column and stays put while the ranked list scrolls beside it, which is the
 * only arrangement where a pin and its card are ever visible at the same time.
 * Below `lg` the two stack, the map keeps a usable height, and the filter panel
 * becomes a sheet the traveller opens over it.
 *
 * The map column is sticky and the results column is not, so there is exactly one
 * scroll context on a phone and no nested scrollbar on a desktop.
 */

const CATEGORY_OPTIONS = ["All", ...DATASET_CATEGORIES] as const;
const PAGE_SIZE = 24;

type Category = (typeof CATEGORY_OPTIONS)[number];
type SortKey = "rank" | "price" | "duration" | "name";

/** One applied constraint, with the control that undoes it. */
type ActiveFilter = { key: string; label: string; onClear: () => void };

export default function ExplorePage() {
  const [learner] = useLearner();
  const [planIds, , hasInPlan, togglePlan] = usePlanIds();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState<CityChoice>("All");
  const [category, setCategory] = useState<Category>("All");
  const [zone, setZone] = useState("All");
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
  const [filtersOpen, setFiltersOpen] = useState(false);

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
    // Collapsed in the server render so there is no hydration mismatch, then
    // opened on mount for wide screens, where the panel has room to sit open
    // beside the map rather than covering it.
    setFiltersOpen(window.innerWidth >= 1024);
  }, []);

  const walkMinutes = deferredMinutes ?? DEFAULT_WALK_MINUTES;

  const input = useMemo(
    () =>
      defaultEngineInput({
        query: deferredQuery,
        cityId: city === "Navi Mumbai" ? "navi-mumbai" : "mumbai",
        category,
        zone,
        budgetInr: maxPrice ?? 1500,
        availableMinutes: walkMinutes,
        rainMode,
        freeOnly,
        communityOnly,
        bestTimeOfDay: bestTime,
        planIds,
      }),
    [bestTime, category, city, communityOnly, deferredQuery, freeOnly, maxPrice, planIds, rainMode, walkMinutes, zone],
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

  const filters: ActiveFilter[] = useMemo(() => {
    const chips: ActiveFilter[] = [];
    if (city !== "All") chips.push({ key: "city", label: city, onClear: () => setCity("All") });
    if (zone !== "All") chips.push({ key: "zone", label: zone, onClear: () => setZone("All") });
    if (category !== "All") chips.push({ key: "category", label: category, onClear: () => setCategory("All") });
    if (maxPrice !== undefined) {
      chips.push({
        key: "budget",
        label: BUDGET_LABELS[maxPrice] ?? `Under ₹${maxPrice}`,
        onClear: () => setMaxPrice(undefined),
      });
    }
    // Only when the traveller actually chose it. The engine default of four hours
    // is a real number the gate uses, but printing it as an applied filter would
    // claim they asked for it.
    if (availableMinutes !== undefined) {
      chips.push({
        key: "walk",
        label: WALK_LABELS[walkMinutes] ?? `${walkMinutes} min walk`,
        onClear: () => setAvailableMinutes(undefined),
      });
    }
    if (bestTime !== "any") {
      chips.push({
        key: "bestTime",
        label: BEST_TIME_OPTIONS.find((option) => option.value === bestTime)?.label ?? bestTime,
        onClear: () => setBestTime("any"),
      });
    }
    if (rainMode) chips.push({ key: "rain", label: "It is raining", onClear: () => setRainMode(false) });
    if (freeOnly) chips.push({ key: "free", label: "Free entry", onClear: () => setFreeOnly(false) });
    if (communityOnly) chips.push({ key: "community", label: "Community sourced", onClear: () => setCommunityOnly(false) });
    return chips;
  }, [availableMinutes, bestTime, category, city, communityOnly, freeOnly, maxPrice, rainMode, walkMinutes, zone]);

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
    // The records come from one module-level table, so a re-render with the same
    // selection hands this effect the same coordinate array and no route is
    // refetched. The id is in the list as well so a different record at the same
    // point still refetches.
    const target = selected?.record.coordinates;
    let cancelled = false;
    setRouteLoading(true);
    setRoute(null);
    setRouteFailed(false);
    fetchStreetRoute(DEMO_ORIGIN.coordinates, target)
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
  }, [selected?.record.coordinates, selected?.record.id]);

  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-[1600px] bg-white lg:my-5 lg:rounded-[28px] lg:shadow-card">
        <Header />
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] xl:grid-cols-[minmax(0,1fr)_29rem]">
          {/* The map column. Sticky on a wide screen, so a pin and its card are
              on screen together, and a fixed height everywhere, because a map
              with no height is a blank rectangle. */}
          <section className="relative h-[23rem] sm:h-[27rem] lg:sticky lg:top-5 lg:my-5 lg:h-[calc(100vh_-_2.5rem)] lg:min-h-[32rem] lg:self-start lg:rounded-l-[28px]">
            <ExperienceMap
              records={visibleRecords}
              selectedId={selected?.record.id}
              onSelect={selectExperience}
              route={route}
              rejectedIds={rejectedIds}
              weather={weather}
            />
            <SearchBar
              query={query}
              setQuery={setQuery}
              applyIntent={(text) => applyIntentTo(text, { setCity, setCategory, setMaxPrice, setAvailableMinutes, setRainMode })}
              filtersOpen={filtersOpen}
              setFiltersOpen={setFiltersOpen}
              activeCount={filters.length}
              resultCount={ranked.length}
            />
            <FilterPanel
              open={filtersOpen}
              onClose={() => setFiltersOpen(false)}
              activeCount={filters.length}
              onClear={clear}
              city={city}
              setCity={setCity}
              category={category}
              setCategory={setCategory}
              zone={zone}
              setZone={setZone}
              budget={maxPrice}
              setBudget={setMaxPrice}
              walkMinutes={walkMinutes}
              setWalkMinutes={setAvailableMinutes}
              bestTime={bestTime}
              setBestTime={setBestTime}
              rainMode={rainMode}
              setRainMode={setRainMode}
              freeOnly={freeOnly}
              setFreeOnly={setFreeOnly}
              communityOnly={communityOnly}
              setCommunityOnly={setCommunityOnly}
              inRadius={run?.retrieved.totalConsidered ?? 0}
              originLabel={DEMO_ORIGIN.label}
              solving={!run}
            />
          </section>

          <aside className="border-t border-line bg-white p-4 sm:p-6 lg:border-l lg:border-t-0 lg:rounded-r-[28px]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue">Engine output</p>
                <h2 className="mt-1.5 text-xl font-bold tracking-[-0.03em]">Ranked matches</h2>
              </div>
              <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                Sort
                <select
                  aria-label="Sort results"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                  className="rounded border border-line bg-white px-2 py-1.5 text-xs font-bold normal-case tracking-normal text-ink hover:border-blue"
                >
                  <option value="rank">Best match</option>
                  <option value="price">Price: low to high</option>
                  <option value="duration">Shortest time</option>
                  <option value="name">Name A to Z</option>
                </select>
              </label>
            </div>

            <div className="mt-2">
              <PipelineStrip run={run} />
            </div>

            {filters.length > 0 && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Applied</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {filters.map((filter) => (
                    <ActiveChip key={filter.key} label={filter.label} onClear={filter.onClear} />
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={clear}
                  className="mt-2 text-[11px] font-bold text-blue hover:underline"
                >
                  Clear everything
                </button>
              </div>
            )}

            <div className="mt-4 border-t border-line pt-4">
              <ProvenanceLegend />
              <div className="mt-3">
                <LearnerSummary learner={learner} />
              </div>
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
            <div className="stage mt-5">
              <div className="stage-3d space-y-3">
                {paged.map((row, index) => (
                  <ResultCard
                    key={row.record.id}
                    row={row}
                    rank={index + 1}
                    isTop={sort === "rank" && index === 0}
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
                className="mt-4 w-full rounded border border-line py-3 text-sm font-bold text-blue transition-colors hover:border-blue"
              >
                Show more ({rows.length - visibleCount} remaining)
              </button>
            )}

            {!ranked.length && run && <EmptyState run={run} onClear={clear} />}

            {run && <ExclusionPanel run={run} cheapest={run.cheapest} />}

            {selected && (
              <div className="mt-6 space-y-4 border-t border-line pt-5">
                <WhyThis
                  components={selected.components}
                  total={selected.objective.value}
                  limit={7}
                  note="This is the ranking score, so a low number can still be the best on offer."
                />
                <WhyNotThat
                  recordName={selected.record.name}
                  rejections={selected.advisory}
                  cheapest={run?.cheapest ?? null}
                  retrievalNote={`${selected.record.name} passed the gate. The list below is what we do not know about it.`}
                  bulkCount={run ? run.gated.rejected.length : 0}
                />
                <Selection
                  record={selected.record}
                  inPlan={hasInPlan(selected.record.id)}
                  onToggle={togglePlan}
                  planCount={planIds.length}
                />
                <DirectionsPanel route={route} loading={routeLoading} failed={routeFailed} />
              </div>
            )}
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
    setCity: (value: CityChoice) => void;
    setCategory: (value: Category) => void;
    setMaxPrice: (value: number | undefined) => void;
    setAvailableMinutes: (value: number | undefined) => void;
    setRainMode: (value: boolean) => void;
  },
) {
  const intent = parseDiscoveryIntent(text);
  if (intent.city) setters.setCity(intent.city);
  if (intent.category && CATEGORY_OPTIONS.includes(intent.category as Category)) setters.setCategory(intent.category as Category);
  setters.setMaxPrice(intent.maxPrice);
  setters.setAvailableMinutes(intent.availableMinutes);
  if (intent.weather) setters.setRainMode(true);
}

function Header() {
  return (
    <header className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-6">
      <a href="/" className="flex items-center gap-2 text-sm font-bold">
        <ArrowLeft size={18} /> Home
      </a>
      <h1 className="text-lg font-bold tracking-[-0.03em]">Explore</h1>
      <p className="w-[4.5rem] text-right text-[11px] font-semibold leading-4 text-muted">
        Map and list
      </p>
    </header>
  );
}

/**
 * The one control that sits over the map at every width.
 *
 * It carries the query, the filter toggle and the live result count, because a
 * traveller changing a filter needs to see the count move without scrolling to
 * find it. The count is read off the run, so it is never a number typed here.
 */
function SearchBar({
  query,
  setQuery,
  applyIntent,
  filtersOpen,
  setFiltersOpen,
  activeCount,
  resultCount,
}: {
  query: string;
  setQuery: (value: string) => void;
  applyIntent: (value: string) => void;
  filtersOpen: boolean;
  setFiltersOpen: (value: boolean) => void;
  activeCount: number;
  resultCount: number;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        applyIntent(query);
      }}
      className="absolute left-4 right-4 top-4 z-20 lg:left-5 lg:right-auto lg:w-[26rem]"
    >
      <div className="flex items-center gap-2 rounded-lg border border-white/70 bg-white/90 px-3 py-2 shadow-floating backdrop-blur-md">
        <MapPin size={17} className="shrink-0 text-blue" weight="fill" aria-hidden="true" />
        <label htmlFor="explore-query" className="sr-only">
          Search experiences
        </label>
        <input
          id="explore-query"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted"
          placeholder="Food under ₹800 in Mumbai"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span aria-live="polite" className="shrink-0 text-[11px] font-bold text-muted">
          {resultCount.toLocaleString("en-IN")}
        </span>
        <button
          type="button"
          aria-label={filtersOpen ? "Hide filters" : "Show filters"}
          aria-expanded={filtersOpen}
          aria-controls="explore-filters"
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={`flex shrink-0 items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-bold ${
            activeCount > 0 ? "border-blue bg-blueSoft/70 text-blue" : "border-line text-ink"
          }`}
        >
          <Funnel size={14} weight={filtersOpen || activeCount > 0 ? "fill" : "regular"} aria-hidden="true" />
          Filters
          {activeCount > 0 ? ` ${activeCount}` : ""}
        </button>
      </div>
    </form>
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
      <div className="mt-5">
        <UiStatePanel state="nothing-retrieved">
          <p className="mt-2 max-w-[68ch] text-sm leading-6">
            {run.dominant
              ? run.dominant.sentence
              : "The search terms matched nothing inside your travel window. Widen the walking radius or clear the category to see more."}
          </p>
        </UiStatePanel>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3">
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
          className="mt-4 inline-flex min-h-[44px] items-center rounded border border-blue px-4 py-2 text-sm font-bold text-blue"
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
    <div className="rounded border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue">Selected from the map or the list</p>
          <p className="mt-1 font-bold">{record.name}</p>
        </div>
        <span className="shrink-0 text-sm font-bold">{record.priceInr === 0 ? "Free" : inrLabel(record.priceInr)}</span>
      </div>
      {/* One add-to-plan implementation, the same toggle the detail page uses. */}
      <div className="mt-4">
        <AddToPlanButton experienceId={record.id} onToggle={onToggle} forced={inPlan} />
      </div>
      <a
        href={`/experience/${record.id}`}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded border border-line px-4 py-3 text-sm font-bold text-blue transition-colors hover:border-blue"
      >
        Open the full place page <ArrowSquareOut size={16} />
      </a>
      <p className="mt-2 text-center text-[11px] leading-4 text-muted">
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
    <section className="rounded border border-line p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue">Directions</p>
          <h3 className="mt-1.5 text-base font-bold">Walking from {DEMO_ORIGIN.label}</h3>
        </div>
        <NavigationArrow size={20} className="shrink-0 text-blue" aria-hidden="true" />
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
          <p className="mt-2 text-[11px] leading-5 text-muted">{route.note}</p>
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
