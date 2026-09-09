"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, BookmarkSimple, CalendarCheck, MapPin, NotePencil, UserCircle } from "@phosphor-icons/react/dist/ssr";
import { BottomNav, StatusLabel } from "@/components/ui";
import { demoUserLocation, estimateFromUser, formatDistance } from "@/lib/location";
import { readPlan } from "@/lib/plan";
import { readSaved } from "@/lib/saved";
import { readReports } from "@/lib/reports";
import { experienceSeed } from "@/lib/seed";

export default function ProfilePage() {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [planIds, setPlanIds] = useState<string[]>([]);
  const [reportCount, setReportCount] = useState(0);

  useEffect(() => {
    const sync = () => {
      setSavedIds(readSaved());
      setPlanIds(readPlan());
      setReportCount(readReports().length);
    };
    sync();
    window.addEventListener("ananta-saved-change", sync);
    window.addEventListener("ananta-plan-change", sync);
    window.addEventListener("ananta-reports-change", sync);
    return () => {
      window.removeEventListener("ananta-saved-change", sync);
      window.removeEventListener("ananta-plan-change", sync);
      window.removeEventListener("ananta-reports-change", sync);
    };
  }, []);

  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1180px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-2 text-sm font-bold"><ArrowLeft size={18} /> Home</a>
          <h1 className="text-lg font-bold">Profile</h1>
          <span className="w-20" />
        </header>
        <section className="px-5 pb-28 pt-10 sm:px-8 lg:px-14 lg:pb-14">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blueSoft text-blue"><UserCircle size={30} weight="fill" /></div>
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.03em]">Demo traveler</h2>
              <p className="mt-1 text-sm text-muted">No account is used in this prototype. Everything below lives on this device only.</p>
            </div>
          </div>

          <div className="mt-8 border border-line p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Your location</p>
              <StatusLabel tone="blue">{demoUserLocation.note}</StatusLabel>
            </div>
            <div className="mt-4 flex items-start gap-3">
              <MapPin size={20} className="mt-0.5 shrink-0 text-blue" weight="fill" />
              <div>
                <p className="font-bold">{demoUserLocation.label} · {demoUserLocation.area}, {demoUserLocation.city}</p>
                <p className="mt-1 text-sm leading-6 text-muted">This is a fixed demo position, not live geolocation. Distances across the app are measured from here and labeled as estimates.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
              <div><p className="text-sm text-muted">Nearest saved place</p><NearestSaved ids={savedIds} /></div>
              <div><p className="text-sm text-muted">Walk-time band</p><p className="mt-1 font-bold">{bandLabel()}</p></div>
              <div><p className="text-sm text-muted">Coverage</p><p className="mt-1 font-bold">Mumbai and Navi Mumbai only</p></div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <StatCard Icon={BookmarkSimple} label="Saved places" value={savedIds.length} href="/saved" note="Stored on this device" />
            <StatCard Icon={CalendarCheck} label="Draft plan stops" value={planIds.length} href="/trips" note="Not a booking" />
            <StatCard Icon={NotePencil} label="Reports submitted" value={reportCount} href="/events" note="Reviewed in Operations" />
          </div>

          <div className="mt-8 border border-amber bg-amberSoft/40 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber">Demo data notice</p>
            <p className="mt-2 text-sm leading-6 text-muted">Saved places, plans, and reports live in this browser's local storage. Clearing site data removes them. Nothing is shared with a server, and no behavioral profile is built in this prototype.</p>
          </div>
        </section>
        <BottomNav />
      </div>
    </main>
  );

  function bandLabel() {
    const nearest = nearestSavedEstimate(savedIds);
    if (!nearest) return "No saved places yet";
    return `${formatDistance(nearest.km)} · about ${nearest.walkMinutes} min walk`;
  }
}

function NearestSaved({ ids }: { ids: string[] }) {
  const nearest = nearestSavedEstimate(ids);
  if (!nearest) return <p className="mt-1 font-bold">—</p>;
  return <p className="mt-1 font-bold">{nearest.name}</p>;
}

function nearestSavedEstimate(ids: string[]) {
  const saved = ids
    .map((id) => experienceById(id))
    .filter((place): place is NonNullable<ReturnType<typeof experienceById>> => Boolean(place))
    .map((place) => ({ place, estimate: estimateFromUser(place.coordinates) }));
  if (!saved.length) return null;
  const nearest = saved.sort((a, b) => a.estimate.km - b.estimate.km)[0];
  return { name: nearest.place.name, km: nearest.estimate.km, walkMinutes: nearest.estimate.walkMinutes };
}

function experienceById(id: string) {
  return experienceSeed.find((place) => place.id === id);
}

function StatCard({ Icon, label, value, href, note }: { Icon: typeof BookmarkSimple; label: string; value: number; href: string; note: string }) {
  return (
    <a href={href} className="border border-line p-5 transition-colors hover:border-blue">
      <div className="flex items-center justify-between"><Icon size={20} className="text-blue" /><span className="text-2xl font-bold">{value}</span></div>
      <p className="mt-3 font-bold">{label}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </a>
  );
}
