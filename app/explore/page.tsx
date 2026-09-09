"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CaretDown, Clock, Funnel, MapPin, NavigationArrow, Train, X } from "@phosphor-icons/react/dist/ssr";
import { ExperienceMap } from "@/components/map";
import { BottomNav, StatusLabel } from "@/components/ui";
import { parseDiscoveryIntent } from "@/lib/discovery";
import { readPlan, writePlan } from "@/lib/plan";
import { providerAvailability, readProviderListings } from "@/lib/provider";
import { recommendExperiences, type RankedExperience } from "@/lib/recommendation";
import { experienceSeed } from "@/lib/seed";

const categories = ["All", "Food", "Culture", "Shopping", "Nature"] as const;
const zones = ["All", "Fort / Kala Ghoda", "Dadar / Matunga", "Vashi", "Kharghar"] as const;
type City = "All" | "Mumbai" | "Navi Mumbai";
type Category = (typeof categories)[number];
type Zone = (typeof zones)[number];

export default function ExplorePage() {
  const [selectedId, setSelectedId] = useState(experienceSeed[0].id);
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
    window.addEventListener("local-tourist-plan-change", sync);
    window.addEventListener("local-tourist-provider-change", syncAvailability);
    const initial = new URLSearchParams(window.location.search).get("q") || "";
    if (initial) applyIntent(initial);
    return () => { window.removeEventListener("local-tourist-plan-change", sync); window.removeEventListener("local-tourist-provider-change", syncAvailability); };
  }, [applyIntent]);

  const zoneExperiences = useMemo(() => zone === "All" ? experienceSeed : experienceSeed.filter((place) => place.zone === zone), [zone]);
  const result = useMemo(() => recommendExperiences(zoneExperiences, { query, intentApplied, city, category, maxPrice, availableMinutes, rainMode, availability }), [availableMinutes, availability, category, city, intentApplied, maxPrice, query, rainMode, zoneExperiences]);
  const visible = result.ranked.map(({ experience }) => experience);
  const selected = visible.find((place) => place.id === selectedId) ?? visible[0];
  const selectExperience = useCallback((id: string) => setSelectedId(id), []);
  const hasConstraints = city !== "All" || category !== "All" || zone !== "All" || maxPrice !== undefined || availableMinutes !== undefined || rainMode || Boolean(query);
  const clear = () => { setCity("All"); setCategory("All"); setZone("All"); setMaxPrice(undefined); setAvailableMinutes(undefined); setRainMode(false); setIntentApplied(false); setQuery(""); setShowExcluded(false); };

  return <main className="min-h-screen bg-canvas"><div className="mx-auto max-w-[1480px] bg-white lg:my-5 lg:rounded-[28px] lg:shadow-card"><Header city={city} setCity={setCity} /><div className="grid lg:grid-cols-[minmax(0,1fr)_430px]"><section className="relative min-h-[540px] overflow-hidden lg:min-h-[720px]"><ExperienceMap experiences={visible} selectedId={selected?.id} onSelect={selectExperience} /><SearchOverlay query={query} setQuery={setQuery} applyIntent={applyIntent} city={city} setCity={setCity} category={category} setCategory={setCategory} zone={zone} setZone={setZone} /></section><aside className="border-l border-line bg-white p-5 sm:p-8"><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Curated demo data</p><h2 className="mt-2 text-2xl font-bold tracking-[-0.04em]">Ranked matches</h2></div><span className="text-sm font-semibold text-muted">{visible.length} results</span></div>{hasConstraints && <ConstraintSummary city={city} category={category} zone={zone} maxPrice={maxPrice} availableMinutes={availableMinutes} rainMode={rainMode} clear={clear} />}<div className="mt-6 space-y-3">{result.ranked.map((item) => <ResultCard key={item.experience.id} item={item} selected={item.experience.id === selected?.id} onSelect={selectExperience} />)}</div>{!visible.length && <div className="mt-6 border border-line bg-canvas p-5"><h3 className="font-bold">No place meets every constraint</h3><p className="mt-2 text-sm leading-6 text-muted">Review why records were excluded or clear one constraint.</p></div>}{result.excluded.length > 0 && <ExcludedList open={showExcluded} setOpen={setShowExcluded} items={result.excluded} />}{selected && <Selection place={selected} plan={plan} />}</aside></div><BottomNav /></div></main>;
}

function Header({ city, setCity }: { city: City; setCity: (city: City) => void }) { return <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8"><a href="/" className="flex items-center gap-2 text-sm font-bold"><ArrowLeft size={18} /> Home</a><h1 className="text-lg font-bold">Explore</h1><button onClick={() => setCity(city === "Navi Mumbai" ? "Mumbai" : "Navi Mumbai")} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold">{city === "Navi Mumbai" ? "Show Mumbai" : "Show Navi Mumbai"}</button></header>; }

function SearchOverlay({ query, setQuery, applyIntent, city, setCity, category, setCategory, zone, setZone }: { query: string; setQuery: (value: string) => void; applyIntent: (value: string) => void; city: City; setCity: (value: City) => void; category: Category; setCategory: (value: Category) => void; zone: Zone; setZone: (value: Zone) => void }) { return <form onSubmit={(event) => { event.preventDefault(); applyIntent(query); }} className="absolute left-5 right-5 top-5 sm:left-8 sm:right-8 sm:top-8"><div className="flex items-center gap-3 rounded-xl border border-white/80 bg-white px-4 py-3 shadow-card"><MapPin size={18} className="text-blue" weight="fill" /><input aria-label="Search experiences" className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" placeholder="Food under ₹800 in Mumbai" value={query} onChange={(event) => { setQuery(event.target.value); }} /><button aria-label="Apply search" className="text-muted"><Funnel size={18} /></button></div><div className="mt-3 flex gap-2 overflow-x-auto pb-2"><FilterButton active={city === "Mumbai"} onClick={() => setCity("Mumbai")}>Mumbai</FilterButton><FilterButton active={city === "Navi Mumbai"} onClick={() => setCity("Navi Mumbai")}>Navi Mumbai</FilterButton>{categories.slice(1).map((item) => <FilterButton key={item} active={category === item} onClick={() => setCategory(category === item ? "All" : item)}>{item}</FilterButton>)}<select aria-label="Filter by zone" value={zone} onChange={(event) => setZone(event.target.value as Zone)} className="shrink-0 rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold"><option value="All">All zones</option>{zones.slice(1).map((item) => <option key={item} value={item}>{item}</option>)}</select></div></form>; }

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) { return <button type="button" onClick={onClick} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-bold ${active ? "bg-blue text-white" : "border border-line bg-white"}`}>{children}</button>; }

function ConstraintSummary({ city, category, zone, maxPrice, availableMinutes, rainMode, clear }: { city: City; category: Category; zone: Zone; maxPrice?: number; availableMinutes?: number; rainMode: boolean; clear: () => void }) { const labels = [city !== "All" && city, category !== "All" && category, zone !== "All" && zone, maxPrice !== undefined && `Under ₹${maxPrice}`, availableMinutes !== undefined && `${availableMinutes} minutes`, rainMode && "Indoor-ready"].filter(Boolean); return <div className="mt-5 border border-line bg-canvas p-4"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Applied constraints</p><button aria-label="Clear filters" onClick={clear}><X size={16} /></button></div><p className="mt-2 text-sm leading-6">{labels.join(" · ") || "Search text"}</p></div>; }

function ResultCard({ item, selected, onSelect }: { item: RankedExperience; selected: boolean; onSelect: (id: string) => void }) { const place = item.experience; return <button onClick={() => onSelect(place.id)} className={`block w-full border p-4 text-left transition-colors ${selected ? "border-blue bg-blueSoft/40" : "border-line hover:border-blue"}`}><div className="flex items-start justify-between gap-3"><div><StatusLabel tone={place.statusTone}>{place.status}</StatusLabel><h3 className="mt-3 font-bold">{place.name}</h3><p className="mt-1 text-sm text-muted">{place.area} · {place.category}</p></div><span className="text-sm font-bold">{place.price}</span></div><div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-muted"><span><Clock size={14} className="mr-1 inline" />{place.duration}</span><span><NavigationArrow size={14} className="mr-1 inline" />{place.travelTime}</span><span><Train size={14} className="mr-1 inline" />{place.station}</span></div><p className="mt-3 text-xs leading-5 text-blue">Why: {item.reasons.slice(0, 3).join(" · ")}</p></button>; }

function ExcludedList({ open, setOpen, items }: { open: boolean; setOpen: (value: boolean) => void; items: ReturnType<typeof recommendExperiences>["excluded"] }) { return <section className="mt-5 border-t border-line pt-4"><button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left text-sm font-bold"><span>Why {items.length} place{items.length === 1 ? " was" : "s were"} excluded</span><CaretDown size={17} className={open ? "rotate-180" : ""} /></button>{open && <div className="mt-3 space-y-3">{items.map(({ experience, reasons }) => <div key={experience.id} className="bg-canvas p-3"><p className="text-sm font-bold">{experience.name}</p><p className="mt-1 text-xs leading-5 text-muted">{reasons.join(" · ")}</p></div>)}</div>}</section>; }

function Selection({ place, plan }: { place: (typeof experienceSeed)[number]; plan: string[] }) { return <div className="mt-6 border-t border-line pt-5"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Current selection</p><p className="mt-1 font-bold">{place.name}</p></div><span className="text-sm font-bold">{place.price}</span></div><button onClick={() => writePlan(plan.includes(place.id) ? plan : [...plan, place.id])} className="mt-4 w-full rounded-lg bg-blue px-4 py-3 text-sm font-bold text-white">{plan.includes(place.id) ? "Added to plan" : "Add to plan"}</button>{plan.length > 0 && <a href="/trips" className="mt-3 block text-center text-xs font-bold text-green">{plan.length} experience{plan.length === 1 ? "" : "s"} in your draft plan</a>}</div>; }
