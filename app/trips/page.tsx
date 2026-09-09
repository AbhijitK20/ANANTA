"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Clock, MapPin, NavigationArrow, ShieldCheck, Trash, Warning, X } from "@phosphor-icons/react/dist/ssr";
import { BottomNav, StatusLabel } from "@/components/ui";
import { closedPlanItems, suggestClosedReplacements } from "@/lib/adapt";
import { evaluatePlan, generatePlanVariants, getPlannedExperiences, readPlan, writePlan } from "@/lib/plan";
import { providerAvailability, readProviderListings } from "@/lib/provider";
import { experienceSeed } from "@/lib/seed";

export default function TripsPage() {
  const [ids, setIds] = useState<string[]>([]);
  const [budget, setBudget] = useState(1500);
  const [availableMinutes, setAvailableMinutes] = useState(240);
  const [deadline, setDeadline] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [weatherAlternative, setWeatherAlternative] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Record<string, "Open" | "Limited" | "Closed">>({});

  useEffect(() => {
    const sync = () => {
      setIds(readPlan());
      setAvailability(providerAvailability(readProviderListings()));
    };
    sync();
    window.addEventListener("ananta-plan-change", sync);
    window.addEventListener("ananta-provider-change", sync);
    return () => { window.removeEventListener("ananta-plan-change", sync); window.removeEventListener("ananta-provider-change", sync); };
  }, []);

  const places = useMemo(() => getPlannedExperiences(ids, experienceSeed), [ids]);
  const evaluation = useMemo(() => evaluatePlan(places, budget, availableMinutes, 15, deadline || undefined), [places, budget, availableMinutes, deadline]);
  const variants = useMemo(() => generatePlanVariants(places, experienceSeed, budget, availableMinutes, deadline || undefined), [availableMinutes, budget, deadline, places]);
  const closedSuggestions = useMemo(
    () => suggestClosedReplacements({ plan: places, catalog: experienceSeed, budget, availableMinutes, deadline: deadline || undefined, availability }),
    [availableMinutes, availability, budget, deadline, places],
  );
  const closedCount = closedPlanItems(places, availability).length;
  const statusTone = !places.length ? "blue" : evaluation.feasible && !closedCount ? "green" : "amber";
  const statusText = !places.length ? "No places added" : closedCount ? "A provider marked a place closed" : evaluation.feasible ? "Fits your limits" : "Needs adjustment";

  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1180px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-2 text-sm font-bold"><ArrowLeft size={18} /> Home</a>
          <h1 className="text-lg font-bold">Trips</h1>
          <a href="/explore" className="text-sm font-bold text-blue">Explore</a>
        </header>
        <section className="px-5 pb-28 pt-10 sm:px-8 lg:px-14 lg:pb-14">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Draft plan</p>
          <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-4xl font-bold tracking-[-0.05em]">Your afternoon in Mumbai</h2>
              <p className="mt-3 max-w-xl leading-7 text-muted">A practical local plan built from the places you selected. Travel times are estimates until a route is confirmed.</p>
            </div>
            <StatusLabel tone={statusTone}>{statusText}</StatusLabel>
          </div>

          <div className="mt-8 grid gap-4 border-y border-line py-5 sm:grid-cols-3">
            <label className="text-sm font-semibold">Available time
              <select value={availableMinutes} onChange={(event) => setAvailableMinutes(Number(event.target.value))} className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-3 font-bold outline-none focus:border-blue">
                <option value={60}>1 hour</option><option value={120}>2 hours</option><option value={240}>4 hours</option><option value={360}>6 hours</option>
              </select>
            </label>
            <label className="text-sm font-semibold">Hard budget
              <input inputMode="numeric" value={budget} onChange={(event) => setBudget(Number(event.target.value) || 0)} className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-3 font-bold outline-none focus:border-blue" aria-label="Hard budget in rupees" />
            </label>
            <label className="text-sm font-semibold">Return by (optional)
              <input type="time" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-3 font-bold outline-none focus:border-blue" />
            </label>
          </div>

          {places.length ? (
            <>
              <div className="grid gap-3 border-b border-line py-5 sm:grid-cols-4">
                <Metric label="Activities" value={`${places.length}`} />
                <Metric label="Activity time" value={`${evaluation.activityMinutes} min`} />
                <Metric label="Travel and buffer" value={`${evaluation.travelMinutes + evaluation.bufferMinutes} min`} />
                <Metric label="Estimated cost" value={`₹${evaluation.totalCost.toLocaleString("en-IN")}`} />
              </div>
              <div className={`mt-6 border p-4 ${evaluation.feasible ? "border-green bg-greenSoft" : "border-amber bg-amberSoft"}`}>
                <div className="flex items-start gap-3">
                  {evaluation.feasible ? <ShieldCheck size={21} className="shrink-0 text-green" /> : <Warning size={21} className="shrink-0 text-amber" />}
                  <div>
                    <p className="font-bold">{evaluation.feasible ? "This plan fits the current limits" : "This plan needs adjustment"}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      {evaluation.timeFits ? `Total estimated time is ${evaluation.totalMinutes} minutes.` : `The plan needs ${evaluation.totalMinutes} minutes, but you have ${availableMinutes} minutes.`}{" "}
                      {evaluation.budgetFits ? `Estimated cost stays within ₹${budget.toLocaleString("en-IN")}.` : `Estimated cost is above your ₹${budget.toLocaleString("en-IN")} budget.`}{" "}
                      {deadline && (evaluation.deadlineFits ? "Your return time has enough room." : "This plan may run past your return time.")}
                    </p>
                    {evaluation.hasWeatherWarning && <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"><p className="text-sm font-semibold text-amber">One selected experience is weather dependent.</p><button onClick={() => setWeatherAlternative(experienceSeed.find((item) => item.statusTone !== "amber" && !ids.includes(item.id))?.id ?? null)} className="text-left text-sm font-bold text-blue hover:underline">Find an indoor alternative</button></div>}
                  </div>
                </div>
              </div>
              {closedSuggestions.length > 0 && closedSuggestions.map((suggestion) => <ClosedAdaptationCard key={suggestion.closed.id} suggestion={suggestion} onApply={() => { const rest = ids.filter((id) => id !== suggestion.closed.id); writePlan(suggestion.replacement ? [...rest, suggestion.replacement.id] : rest); }} />)}
              {weatherAlternative && <AlternativeCard alternativeId={weatherAlternative} currentIds={ids} onClose={() => setWeatherAlternative(null)} onApply={() => { const next = ids.filter((id) => experienceSeed.find((item) => item.id === id)?.statusTone !== "amber"); writePlan([...next, weatherAlternative]); setWeatherAlternative(null); }} />}
              <div className="mt-8 space-y-3">
                {places.map((place, index) => <article key={place.id} className="grid gap-4 border border-line p-5 sm:grid-cols-[52px_1fr_auto] sm:items-center"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-blueSoft text-sm font-bold text-blue">{index + 1}</div><div><div className="flex flex-wrap items-center gap-3"><h3 className="text-lg font-bold">{place.name}</h3><StatusLabel tone={place.statusTone}>{place.status}</StatusLabel></div><p className="mt-2 text-sm text-muted">{place.area} · {place.category}</p><div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-muted"><span><Clock size={14} className="mr-1 inline" />{place.duration}</span><span><NavigationArrow size={14} className="mr-1 inline" />{place.travelTime}</span><span><MapPin size={14} className="mr-1 inline" />Near {place.station}</span></div></div><button onClick={() => writePlan(ids.filter((id) => id !== place.id))} aria-label={`Remove ${place.name}`} className="justify-self-start rounded-lg border border-line p-2 text-muted hover:border-red-300 hover:text-red-600 sm:justify-self-end"><Trash size={18} /></button></article>)}
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row"><a href="/explore" className="inline-flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-3 text-sm font-bold">Add another place <ArrowRight size={17} /></a><button onClick={() => setComparing((value) => !value)} className="rounded-lg border border-line px-4 py-3 text-sm font-bold">{comparing ? "Hide alternatives" : "Compare feasible plans"}</button><button onClick={() => setReviewing((value) => !value)} disabled={!evaluation.feasible} className="rounded-lg bg-blue px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-line disabled:text-muted">{reviewing ? "Hide timeline" : "Review this plan"}</button></div>
              {comparing && <PlanComparison variants={variants} currentIds={ids} onApply={(nextIds) => { writePlan(nextIds); setComparing(false); }} />}
              {reviewing && <PlanTimeline places={places} />}
            </>
          ) : (
            <div className="mt-10 border border-line bg-canvas p-8"><h3 className="text-xl font-bold">Your draft plan is empty</h3><p className="mt-2 max-w-lg leading-7 text-muted">Choose a place from Explore and add it here. We will calculate time, travel, and cost as the planning flow grows.</p><a href="/explore" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue px-4 py-3 text-sm font-bold text-white">Explore local places <ArrowRight size={17} /></a></div>
          )}
        </section>
        <BottomNav />
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-sm text-muted">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>;
}

function ClosedAdaptationCard({ suggestion, onApply }: { suggestion: ReturnType<typeof suggestClosedReplacements>[number]; onApply: () => void }) {
  return <section className="mt-5 border border-amber bg-amberSoft/40 p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-amber">Plan needs attention</p><h3 className="mt-2 text-lg font-bold">{suggestion.closed.name} was marked closed by its provider</h3><p className="mt-1 text-sm leading-6 text-muted">{suggestion.detail}</p></div></div>{suggestion.replacement && <div className="mt-4 border border-line bg-white p-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Suggested replacement</p><h4 className="mt-2 font-bold">{suggestion.replacement.name}</h4><p className="mt-1 text-sm text-muted">{suggestion.replacement.area} · {suggestion.replacement.duration} · {suggestion.replacement.price}</p><p className="mt-2 text-xs leading-5 text-muted">Checked against the remaining time, budget, and return deadline. Nothing changes until you confirm.</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={onApply} className="rounded-lg bg-blue px-4 py-2.5 text-sm font-bold text-white">Replace with {suggestion.replacement.name}</button></div></div>}{!suggestion.replacement && <div className="mt-4 flex flex-wrap gap-2"><button onClick={onApply} className="rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-bold">Remove it from the plan</button></div>}</section>;
}

function PlanTimeline({ places }: { places: typeof experienceSeed }) {
  return <section className="mt-8 border-t border-line pt-7"><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Plan review</p><h3 className="mt-2 text-2xl font-bold tracking-[-0.04em]">A workable afternoon sequence</h3><div className="mt-6 space-y-2">{places.map((place, index) => <div key={place.id}><article className="grid gap-4 border border-line p-5 sm:grid-cols-[90px_1fr_auto] sm:items-start"><div><p className="text-sm font-bold text-blue">{index === 0 ? "Start" : `${index + 1}:15 PM`}</p><p className="mt-1 text-xs text-muted">{place.duration}</p></div><div><h4 className="font-bold">{place.name}</h4><p className="mt-1 text-sm text-muted">{place.area} · {place.station}</p><p className="mt-3 text-sm leading-6 text-muted">Selected because it matches the current interest and sits inside the available plan area.</p></div><StatusLabel tone={place.statusTone}>{place.price}</StatusLabel></article>{index < places.length - 1 && <div className="travel-connector ml-8 py-3 pl-5 text-xs font-semibold text-muted"><span aria-hidden="true" className="travel-connector-line" /><span aria-hidden="true" className="travel-connector-dot" /><NavigationArrow size={14} className="mr-1 inline" />Estimated travel · {places[index + 1].travelTime}</div>}</div>)}</div></section>;
}

function AlternativeCard({ alternativeId, currentIds, onClose, onApply }: { alternativeId: string; currentIds: string[]; onClose: () => void; onApply: () => void }) {
  const alternative = experienceSeed.find((item) => item.id === alternativeId);
  if (!alternative) return null;
  return <section className="mt-5 border border-blue bg-blueSoft/40 p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Suggested alternative</p><h3 className="mt-2 text-lg font-bold">{alternative.name}</h3><p className="mt-1 text-sm text-muted">Indoor-ready alternative · {alternative.duration} · {alternative.price}</p><p className="mt-3 text-sm leading-6 text-muted">This option removes the weather-dependent stop and keeps the rest of the plan within the current area.</p></div><button onClick={onClose} aria-label="Close alternative" className="text-muted"><X size={18} /></button></div><div className="mt-4 flex gap-2"><button onClick={onApply} className="rounded-lg bg-blue px-4 py-2.5 text-sm font-bold text-white">Apply alternative</button><button onClick={onClose} className="rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-bold">Keep current plan</button></div></section>;
}

function PlanComparison({ variants, currentIds, onApply }: { variants: ReturnType<typeof generatePlanVariants>; currentIds: string[]; onApply: (ids: string[]) => void }) {
  if (!variants.length) return <section className="mt-8 border border-line bg-canvas p-5"><h3 className="font-bold">No alternative plan fits these limits</h3><p className="mt-2 text-sm leading-6 text-muted">Increase the available time or budget to compare another feasible combination.</p></section>;
  return <section className="mt-8 border-t border-line pt-7"><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Plan comparison</p><h3 className="mt-2 text-2xl font-bold tracking-[-0.04em]">Alternatives based on listed facts</h3><p className="mt-2 text-sm leading-6 text-muted">These options use demo prices and access-time estimates. They are not live availability claims.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{variants.map((variant) => { const variantIds = variant.experiences.map(({ id }) => id); const current = variantIds.length === currentIds.length && variantIds.every((id) => currentIds.includes(id)); return <article key={variant.id} className="border border-line p-5"><StatusLabel tone={current ? "green" : "blue"}>{current ? "Current plan" : variant.label}</StatusLabel><h4 className="mt-4 font-bold">{variant.experiences.map(({ name }) => name).join(" + ")}</h4><p className="mt-2 text-sm leading-6 text-muted">{variant.description}</p><div className="mt-4 grid grid-cols-2 gap-3 border-y border-line py-3 text-sm"><div><p className="text-xs text-muted">Listed cost</p><p className="mt-1 font-bold">₹{variant.evaluation.totalCost.toLocaleString("en-IN")}</p></div><div><p className="text-xs text-muted">Estimated total</p><p className="mt-1 font-bold">{variant.evaluation.totalMinutes} min</p></div></div><button disabled={current} onClick={() => onApply(variantIds)} className="mt-4 w-full rounded-lg bg-blue px-4 py-2.5 text-sm font-bold text-white disabled:bg-line disabled:text-muted">{current ? "Currently selected" : "Use this plan"}</button></article>; })}</div></section>;
}
