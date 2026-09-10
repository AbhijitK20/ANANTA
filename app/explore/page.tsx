"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowSquareOut, CaretDown, Clock, Funnel, MapPin, NavigationArrow, Train, X } from "@phosphor-icons/react/dist/ssr";
import { ExperienceMap } from "@/components/map";
import { BottomNav, StatusLabel } from "@/components/ui";
import { parseDiscoveryIntent } from "@/lib/discovery";
import { demoUserLocation, estimateFromUser, formatDistance } from "@/lib/location";
import { readPlan, writePlan } from "@/lib/plan";
import { providerAvailability, readProviderListings } from "@/lib/provider";
import { recommendExperiences, type RankedExperience } from "@/lib/recommendation";
import { applyQuickFilters, BEST_TIME_OPTIONS } from "@/lib/quick-filters";
import { fetchStreetRoute, type StreetRoute } from "@/lib/routing";
import { allExperiences, DATASET_CATEGORIES } from "@/lib/data";
import { zones as dataZones, type Experience } from "@/lib/seed";

const categories = ["All", ...DATASET_CATEGORIES] as const;
const zones = ["All", ...dataZones] as const;
const PAGE_SIZE = 24;
type City = "All" | "Mumbai" | "Navi Mumbai";
type Category = (typeof categories)[number];
type Zone = (typeof zones)[number];

export default function ExplorePage() {
  const [selectedId, setSelectedId] = useState(allExperiences[0].id);
  const [plan, setPlan] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState<City>("All");
  const [category, setCategory] = useState<Category>("All");
  const [zone, setZone] = useState<Zone>("All");
  const [maxPrice, setMaxPrice] = useState<number>();
  const [availableMinutes, setAvailableMinutes] = useState<number>();
  const [rainMode, setRainMode] = useState(false);
  const [intentApplied, setIntentApplied] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [availability, setAvailability] = useState<Record<string, "Open" | "Limited" | "Closed">>({});
  const [route, setRoute] = useState<StreetRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [hiddenGems, setHiddenGems] = useState(false);
  const [walkable, setWalkable] = useState(false);
  const [free, setFree] = useState(false);
  const [bestTime, setBestTime] = useState<string>("Any time");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const applyIntent = useCallback((text: string) => {
    const intent = parseDiscoveryIntent(text);
    const naturalRequest = /\b(i have|near|want|under|below|budget|before|rain|monsoon|hours?|minutes?)\b/i.test(text);
    setQuery(text);
    if (intent.city) setCity(intent.city);
    if (intent.category && categories.includes(intent.category as Category)) setCategory(intent.category as Category);
    setMaxPrice(intent.maxPrice);
    setAvailableMinutes(intent.availableMinutes);
    setRainMode(intent.weather === "rain");
    setIntentApplied(naturalRequest && Boolean(intent.city || intent.category || intent.maxPrice !== undefined || intent.availableMinutes !== undefined || intent.weather));
  }, []);

  useEffect(() => {
    const sync = () => setPlan(readPlan());
    const syncAvailability = () => setAvailability(providerAvailability(readProviderListings()));
    sync();
    syncAvailability();
    window.addEventListener("ananta-plan-change", sync);
    window.addEventListener("ananta-provider-change", syncAvailability);
    const params = new URLSearchParams(window.location.search);
    const initial = params.get("q") || "";
    if (initial) applyIntent(initial);
    if (params.get("gems") === "1") setHiddenGems(true);
    if (params.get("free") === "1") setFree(true);
    if (params.get("walkable") === "1") setWalkable(true);
    setVisibleCount(PAGE_SIZE);
    const bestTimeParam = params.get("bestTime");
    if (bestTimeParam && BEST_TIME_OPTIONS.includes(bestTimeParam as (typeof BEST_TIME_OPTIONS)[number])) setBestTime(bestTimeParam);
    const cityParam = params.get("city");
    if (cityParam === "Mumbai" || cityParam === "Navi Mumbai") setCity(cityParam);
    return () => { window.removeEventListener("ananta-plan-change", sync); window.removeEventListener("ananta-provider-change", syncAvailability); };
  }, [applyIntent]);

  const zoneExperiences = useMemo(() => zone === "All" ? allExperiences : allExperiences.filter((place) => place.zone === zone), [zone]);
  const result = useMemo(() => recommendExperiences(zoneExperiences, { query, intentApplied, city, category, maxPrice, availableMinutes, rainMode, availability, origin: demoUserLocation.coordinates }), [availableMinutes, availability, category, city, intentApplied, maxPrice, query, rainMode, zoneExperiences]);
  const quick = useMemo(() => applyQuickFilters(result.ranked.map(({ experience }) => experience), { hiddenGems, walkable, free, bestTime }), [bestTime, free, hiddenGems, result, walkable]);
  const keptIds = useMemo(() => new Set(quick.kept.map(({ id }) => id)), [quick]);
  const visibleRanked = useMemo(() => result.ranked.filter(({ experience }) => keptIds.has(experience.id)), [keptIds, result]);
  const visible = visibleRanked.map(({ experience }) => experience);
  const pagedRanked = useMemo(() => visibleRanked.slice(0, visibleCount), [visibleCount, visibleRanked]);
  const allExcluded = useMemo(() => [...result.excluded, ...quick.excluded], [quick, result]);
  const selected = visible.find((place) => place.id === selectedId) ?? visible[0];
  const effectiveSelectedId = selected?.id;

  // Fetch the real walking route from the fixed demo position to the selection.
  useEffect(() => {
    const target = allExperiences.find((place) => place.id === effectiveSelectedId);
    if (!target) { setRoute(null); return; }
    let cancelled = false;
    setRouteLoading(true);
    setRoute(null);
    fetchStreetRoute(demoUserLocation.coordinates, target.coordinates)
      .then((result) => { if (!cancelled) { setRoute(result); setRouteLoading(false); } })
      .catch(() => { if (!cancelled) setRouteLoading(false); });
    return () => { cancelled = true; };
  }, [effectiveSelectedId]);

  const selectExperience = useCallback((id: string) => setSelectedId(id), []);
  const hasConstraints = city !== "All" || category !== "All" || zone !== "All" || maxPrice !== undefined || availableMinutes !== undefined || rainMode || Boolean(query) || hiddenGems || walkable || free || bestTime !== "Any time";
  const clear = () => { setCity("All"); setCategory("All"); setZone("All"); setMaxPrice(undefined); setAvailableMinutes(undefined); setRainMode(false); setIntentApplied(false); setQuery(""); setShowExcluded(false); setHiddenGems(false); setWalkable(false); setFree(false); setBestTime("Any time"); setVisibleCount(PAGE_SIZE); };

  return <main id="main-content" className="min-h-screen bg-canvas"><div className="mx-auto max-w-[1480px] bg-white lg:my-5 lg:rounded-[28px] lg:shadow-card"><Header city={city} setCity={setCity} /><div className="flex flex-col lg:h-[calc(100vh-12rem)]"><section className="relative h-[540px] shrink-0 overflow-hidden lg:h-auto lg:min-h-0 lg:flex-[3]"><ExperienceMap experiences={visible} selectedId={selected?.id} onSelect={selectExperience} route={route} /><SearchOverlay query={query} setQuery={setQuery} applyIntent={applyIntent} city={city} setCity={setCity} category={category} setCategory={setCategory} zone={zone} setZone={setZone} maxPrice={maxPrice} setMaxPrice={setMaxPrice} availableMinutes={availableMinutes} setAvailableMinutes={setAvailableMinutes} rainMode={rainMode} setRainMode={setRainMode} hiddenGems={hiddenGems} setHiddenGems={setHiddenGems} walkable={walkable} setWalkable={setWalkable} free={free} setFree={setFree} bestTime={bestTime} setBestTime={setBestTime} /></section><aside className="border-t border-line bg-white p-5 sm:p-8 lg:min-h-0 lg:flex-[2] lg:overflow-y-auto"><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Curated demo data</p><h2 className="mt-2 text-2xl font-bold tracking-[-0.04em]">Ranked matches</h2></div><span className="text-sm font-semibold text-muted">{visible.length} results</span></div>{hasConstraints && <ConstraintSummary city={city} category={category} zone={zone} maxPrice={maxPrice} availableMinutes={availableMinutes} rainMode={rainMode} hiddenGems={hiddenGems} walkable={walkable} free={free} bestTime={bestTime} clear={clear} />}<div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{pagedRanked.map((item) => <ResultCard key={item.experience.id} item={item} selected={item.experience.id === selected?.id} onSelect={selectExperience} />)}</div>
          {visibleCount < visibleRanked.length && <button onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} className="w-full border border-line py-3 text-sm font-bold text-blue transition-colors hover:border-blue">Show more ({visibleRanked.length - visibleCount} remaining)</button>}{!visible.length && <div className="mt-6 border border-line bg-canvas p-5"><h3 className="font-bold">No place meets every constraint</h3><p className="mt-2 text-sm leading-6 text-muted">Review why records were excluded or clear one constraint.</p></div>}{allExcluded.length > 0 && <ExcludedList open={showExcluded} setOpen={setShowExcluded} items={allExcluded} />}{selected && <Selection place={selected} plan={plan} />}{selected && <DirectionsPanel route={route} loading={routeLoading} />}</aside></div><BottomNav /></div></main>;
}

function Header({ city, setCity }: { city: City; setCity: (city: City) => void }) { return <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8"><a href="/" className="flex items-center gap-2 text-sm font-bold"><ArrowLeft size={18} /> Home</a><h1 className="text-lg font-bold">Explore</h1><button onClick={() => setCity(city === "Navi Mumbai" ? "Mumbai" : "Navi Mumbai")} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold">{city === "Navi Mumbai" ? "Show Mumbai" : "Show Navi Mumbai"}</button></header>; }

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

function SearchOverlay({ query, setQuery, applyIntent, city, setCity, category, setCategory, zone, setZone, maxPrice, setMaxPrice, availableMinutes, setAvailableMinutes, rainMode, setRainMode, hiddenGems, setHiddenGems, walkable, setWalkable, free, setFree, bestTime, setBestTime }: {
  query: string; setQuery: (value: string) => void; applyIntent: (value: string) => void;
  city: City; setCity: (value: City) => void; category: Category; setCategory: (value: Category) => void; zone: Zone; setZone: (value: Zone) => void;
  maxPrice?: number; setMaxPrice: (value: number | undefined) => void; availableMinutes?: number; setAvailableMinutes: (value: number | undefined) => void; rainMode: boolean; setRainMode: (value: boolean) => void;
  hiddenGems: boolean; setHiddenGems: (value: boolean) => void; walkable: boolean; setWalkable: (value: boolean) => void; free: boolean; setFree: (value: boolean) => void; bestTime: string; setBestTime: (value: string) => void;
}) {
  // Collapsed in the server render (no hydration mismatch), then opened on
  // mount for wide screens so desktops see the stacked panel immediately.
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(window.innerWidth >= 1024); }, []);
  const activeCount = (city !== "All" ? 1 : 0) + (category !== "All" ? 1 : 0) + (zone !== "All" ? 1 : 0) + (maxPrice !== undefined ? 1 : 0) + (availableMinutes !== undefined ? 1 : 0) + (rainMode ? 1 : 0) + (hiddenGems ? 1 : 0) + (walkable ? 1 : 0) + (free ? 1 : 0) + (bestTime !== "Any time" ? 1 : 0);
  return <form onSubmit={(event) => { event.preventDefault(); applyIntent(query); }} className="absolute left-5 right-5 top-5 sm:left-8 sm:right-8 sm:top-8">
    <div className="flex items-center gap-3 rounded-xl border border-white/80 bg-white px-4 py-3 shadow-card">
      <MapPin size={18} className="shrink-0 text-blue" weight="fill" />
      <input aria-label="Search experiences" className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" placeholder="Food under ₹800 in Mumbai" value={query} onChange={(event) => { setQuery(event.target.value); }} />
      <button aria-label="Apply search" className="text-muted"><Funnel size={18} /></button>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold ${activeCount > 0 ? "border-blue bg-blueSoft/60 text-blue" : "border-line text-ink"}`}>
        <Funnel size={14} /> Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
      </button>
    </div>
    {open && <div className="mt-3 max-h-[62vh] space-y-4 overflow-y-auto rounded-xl border border-white/80 bg-white/95 p-4 shadow-card backdrop-blur-sm">
      <FilterGroup label="Where">
        <FilterButton active={city === "All"} onClick={() => setCity("All")}>All cities</FilterButton>
        <FilterButton active={city === "Mumbai"} onClick={() => setCity("Mumbai")}>Mumbai</FilterButton>
        <FilterButton active={city === "Navi Mumbai"} onClick={() => setCity("Navi Mumbai")}>Navi Mumbai</FilterButton>
        <select aria-label="Filter by zone" value={zone} onChange={(event) => setZone(event.target.value as Zone)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold">
          <option value="All">All zones</option>
          {zones.slice(1).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </FilterGroup>
      <FilterGroup label="What">
        <FilterButton active={category === "All"} onClick={() => setCategory("All")}>Everything</FilterButton>
        {categories.slice(1).map((item) => <FilterButton key={item} active={category === item} onClick={() => setCategory(category === item ? "All" : item)}>{item}</FilterButton>)}
      </FilterGroup>
      <FilterGroup label="Budget and time">
        <select aria-label="Filter by budget" value={maxPrice ?? ""} onChange={(event) => setMaxPrice(event.target.value === "" ? undefined : Number(event.target.value))} className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold">
          {BUDGET_OPTIONS.map((item) => <option key={item.label} value={item.value ?? ""}>{item.label}</option>)}
        </select>
        <select aria-label="Filter by time available" value={availableMinutes ?? ""} onChange={(event) => setAvailableMinutes(event.target.value === "" ? undefined : Number(event.target.value))} className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold">
          {TIME_OPTIONS.map((item) => <option key={item.label} value={item.value ?? ""}>{item.label}</option>)}
        </select>
        <FilterButton active={rainMode} onClick={() => setRainMode(!rainMode)}>Rain-ready (indoor)</FilterButton>
      </FilterGroup>
      <FilterGroup label="When">
        <select aria-label="Filter by best time" value={bestTime} onChange={(event) => setBestTime(event.target.value)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold">
          <option value="Any time">Any time of day</option>
          {BEST_TIME_OPTIONS.slice(1).map((item) => <option key={item} value={item}>{item.replace("Best ", "").replace("the ", "")}</option>)}
        </select>
      </FilterGroup>
      <FilterGroup label="Vibe">
        <FilterButton active={hiddenGems} onClick={() => setHiddenGems(!hiddenGems)}>Hidden gems</FilterButton>
        <FilterButton active={walkable} onClick={() => setWalkable(!walkable)}>Walkable from me</FilterButton>
        <FilterButton active={free} onClick={() => setFree(!free)}>Free entry</FilterButton>
      </FilterGroup>
    </div>}
  </form>;
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return <div>
    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>;
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) { return <button type="button" onClick={onClick} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-bold ${active ? "bg-blue text-white" : "border border-line bg-white"}`}>{children}</button>; }

function ConstraintSummary({ city, category, zone, maxPrice, availableMinutes, rainMode, hiddenGems, walkable, free, bestTime, clear }: { city: City; category: Category; zone: Zone; maxPrice?: number; availableMinutes?: number; rainMode: boolean; hiddenGems: boolean; walkable: boolean; free: boolean; bestTime: string; clear: () => void }) {  const labels = [city !== "All" && city, category !== "All" && category, zone !== "All" && zone, maxPrice !== undefined && (BUDGET_LABELS[maxPrice] ?? `Under ₹${maxPrice}`), availableMinutes !== undefined && (TIME_LABELS[availableMinutes] ?? `${availableMinutes} minutes`), rainMode && "Indoor-ready", hiddenGems && "Hidden gems", walkable && "Walkable from me", free && "Free entry", bestTime !== "Any time" && bestTime].filter(Boolean); return <div className="mt-5 border border-line bg-canvas p-4"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Applied constraints</p><button aria-label="Clear filters" onClick={clear}><X size={16} /></button></div><p className="mt-2 text-sm leading-6">{labels.join(" · ") || "Search text"}</p></div>; }

function ResultCard({ item, selected, onSelect }: { item: RankedExperience; selected: boolean; onSelect: (id: string) => void }) { const place = item.experience; const estimate = estimateFromUser(place.coordinates); return <button onClick={() => onSelect(place.id)} className={`block w-full border p-4 text-left transition-colors ${selected ? "border-blue bg-blueSoft/40" : "border-line hover:border-blue"}`}><div className="flex items-start justify-between gap-3"><div><StatusLabel tone={place.statusTone}>{place.status}</StatusLabel><h3 className="mt-3 font-bold">{place.name}</h3><p className="mt-1 text-sm text-muted">{place.area} · {place.category}</p></div><span className="text-sm font-bold">{place.price}</span></div><div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-muted"><span><Clock size={14} className="mr-1 inline" />{place.duration}</span><span><NavigationArrow size={14} className="mr-1 inline" />{place.travelTime}</span><span><Train size={14} className="mr-1 inline" />{place.station}</span></div><p className="mt-3 text-xs leading-5 text-blue">Why: {item.reasons.slice(0, 3).join(" · ")}</p><p className="mt-2 text-xs font-semibold text-muted">{formatDistance(estimate.km)} from {demoUserLocation.label} · about {estimate.walkMinutes} min walk (estimate)</p></button>; }

function ExcludedList({ open, setOpen, items }: { open: boolean; setOpen: (value: boolean) => void; items: ReturnType<typeof recommendExperiences>["excluded"] }) { return <section className="mt-5 border-t border-line pt-4"><button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left text-sm font-bold"><span>Why {items.length} place{items.length === 1 ? " was" : "s were"} excluded</span><CaretDown size={17} className={open ? "rotate-180" : ""} /></button>{open && <div className="mt-3 space-y-3">{items.map(({ experience, reasons }) => <div key={experience.id} className="bg-canvas p-3"><p className="text-sm font-bold">{experience.name}</p><p className="mt-1 text-xs leading-5 text-muted">{reasons.join(" · ")}</p></div>)}</div>}</section>; }

function Selection({ place, plan }: { place: Experience; plan: string[] }) { return <div className="mt-6 border-t border-line pt-5"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Current selection</p><p className="mt-1 font-bold">{place.name}</p></div><span className="text-sm font-bold">{place.price}</span></div><button onClick={() => writePlan(plan.includes(place.id) ? plan : [...plan, place.id])} className="mt-4 w-full rounded-lg bg-blue px-4 py-3 text-sm font-bold text-white">{plan.includes(place.id) ? "Added to plan" : "Add to plan"}</button><a href={`/experience/${place.id}`} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-line px-4 py-3 text-sm font-bold text-blue transition-colors hover:border-blue">Open the full place page <ArrowSquareOut size={16} /></a><p className="mt-2 text-center text-xs text-muted">Photos, videos, About, and turn-by-turn directions live there.</p>{plan.length > 0 && <a href="/trips" className="mt-3 block text-center text-xs font-bold text-green">{plan.length} experience{plan.length === 1 ? "" : "s"} in your draft plan</a>}</div>; }

function DirectionsPanel({ route, loading }: { route: StreetRoute | null; loading: boolean }) {
  return <section className="mt-6 border border-line p-5" aria-live="polite"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Directions</p><h3 className="mt-2 text-lg font-bold">Walking from {demoUserLocation.label}</h3></div><NavigationArrow size={20} className="text-blue" /></div>{loading && <p className="mt-3 text-sm text-muted">Finding the walking route on the map...</p>}{!loading && route && <div><div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><span className="font-bold">{formatDistance(route.distanceKm)}</span><span className="text-muted">about {route.durationMinutes} min walk</span><StatusLabel tone={route.kind === "street" ? "green" : "amber"}>{route.kind === "street" ? "Street route" : "Estimate only"}</StatusLabel></div><p className="mt-2 text-xs leading-5 text-muted">{route.note}</p>{route.steps.length > 0 && <ol className="mt-4 space-y-2 border-t border-line pt-4">{route.steps.map((step, index) => <li key={`${step.instruction}-${index}`} className="flex gap-3 text-sm"><span className="w-5 shrink-0 text-right text-xs font-bold text-blue">{index + 1}</span><span><span className="font-bold">{step.instruction}</span>{step.streetName ? ` onto ${step.streetName}` : ""}{step.distanceMeters >= 1000 ? <span className="text-muted"> · {(step.distanceMeters / 1000).toFixed(1)} km</span> : <span className="text-muted"> · {step.distanceMeters} m</span>}</span></li>)}</ol>}</div>}</section>;
}
