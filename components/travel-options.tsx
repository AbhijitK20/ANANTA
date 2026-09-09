"use client";

import { useEffect, useState } from "react";
import { Bicycle, Car, ClockCounterClockwise, PersonSimpleWalk } from "@phosphor-icons/react/dist/ssr";
import { StatusLabel } from "@/components/ui";
import { demoUserLocation, formatDistance } from "@/lib/location";
import { fetchStreetRoute, TRAVEL_MODES, type StreetRoute, type TravelMode } from "@/lib/routing";

const MODE_ICON = { foot: PersonSimpleWalk, bike: Bicycle, car: Car } as const;

export function TravelOptions({ coordinates, placeName }: { coordinates: [number, number]; placeName: string }) {
  const [routes, setRoutes] = useState<Partial<Record<TravelMode, StreetRoute>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRoutes({});
    // Fire all three profiles in parallel; each resolves independently and a
    // failed mode simply renders its "estimate" fallback, never a blank slot.
    Promise.all(
      TRAVEL_MODES.map((mode) =>
        fetchStreetRoute(demoUserLocation.coordinates, coordinates, mode.id)
          .then((route) => [mode.id, route] as const)
          .catch(() => [mode.id, undefined] as const),
      ),
    ).then((entries) => {
      if (cancelled) return;
      setRoutes(Object.fromEntries(entries));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [coordinates]);

  const withRoutes = TRAVEL_MODES.map((mode) => ({ mode, route: routes[mode.id] })).filter((entry): entry is { mode: (typeof TRAVEL_MODES)[number]; route: StreetRoute } => Boolean(entry.route));
  if (!loading && withRoutes.length === 0) return null;
  const fastest = withRoutes.slice().sort((a, b) => a.route.durationMinutes - b.route.durationMinutes)[0];

  return <section className="mt-8 border border-line bg-[#fbfcfd] p-5" aria-live="polite">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Getting there</p>
        <h2 className="mt-2 text-lg font-bold">Ways to reach {placeName}</h2>
      </div>
      {loading && <ClockCounterClockwise size={20} className="animate-spin text-muted" />}
    </div>
    <p className="mt-2 text-xs font-semibold text-muted">Live estimates from {demoUserLocation.label}, from OpenStreetMap routing. Not live traffic.</p>
    {loading && <p className="mt-4 text-sm text-muted">Comparing walking, cycling, and driving routes...</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {withRoutes.map(({ mode, route }) => {
        const Icon = MODE_ICON[mode.id];
        const isFastest = fastest?.mode.id === mode.id;
        return <div key={mode.id} className={`border p-4 ${isFastest ? "border-blue bg-blueSoft/40" : "border-line bg-white"}`}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-bold"><Icon size={18} className="text-blue" /> {mode.label}</span>
            {isFastest && <StatusLabel tone="green">Fastest</StatusLabel>}
          </div>
          <p className="mt-3 text-xl font-bold tracking-[-0.02em]">{route.durationMinutes} min</p>
          <p className="mt-1 text-xs font-semibold text-muted">{formatDistance(route.distanceKm)} route</p>
          <p className="mt-2 text-[11px] leading-4 text-muted">{route.kind === "street" ? "Street route from OpenStreetMap" : "Straight-line estimate; routing unavailable"}</p>
        </div>;
      })}
    </div>
    {fastest && fastest.route.steps.length > 0 && <details className="mt-4 border-t border-line pt-3">
      <summary className="cursor-pointer text-sm font-bold">Turn-by-turn for the {fastest.mode.label.toLowerCase()} route</summary>
      <ol className="mt-3 space-y-2">
        {fastest.route.steps.map((step, index) => <li key={`${step.instruction}-${index}`} className="flex gap-3 text-sm">
          <span className="w-5 shrink-0 text-right text-xs font-bold text-blue">{index + 1}</span>
          <span><span className="font-bold">{step.instruction}</span>{step.streetName ? ` onto ${step.streetName}` : ""}{step.distanceMeters >= 1000 ? <span className="text-muted"> · {(step.distanceMeters / 1000).toFixed(1)} km</span> : <span className="text-muted"> · {step.distanceMeters} m</span>}</span>
        </li>)}
      </ol>
    </details>}
  </section>;
}
