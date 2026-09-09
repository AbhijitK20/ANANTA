import { ArrowRight, CalendarDots, MapPin } from "@phosphor-icons/react/dist/ssr";
import { experienceSeed, eventSeed } from "@/lib/seed";
import { BottomNav, SectionHeading, StatusLabel } from "@/components/ui";
import { DiscoverySearch } from "@/components/discovery-search";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1480px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue text-sm font-bold text-white">LT</div>
            <span className="text-lg font-bold tracking-[-0.03em]">Local Tourist</span>
          </div>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-muted md:flex">
            <a className="text-ink" href="/">Discover</a><a href="/explore">Explore map</a><a href="/events">Events</a><a href="/saved">Saved</a><a href="/provider">Provider</a><a href="/admin/operations">Operations</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>
          </nav>
          <button className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink">Mumbai</button>
        </header>

        <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,.95fr)]">
          <section className="px-5 pb-12 pt-12 sm:px-8 lg:px-14 lg:pt-20">
            <p className="mb-5 text-sm font-bold uppercase tracking-[0.14em] text-blue">Mumbai and Navi Mumbai</p>
            <h1 className="max-w-[620px] text-4xl font-bold leading-[1.04] tracking-[-0.055em] text-ink sm:text-6xl">Find something worth the time you have.</h1>
            <p className="mt-6 max-w-[520px] text-lg leading-8 text-muted">Explore curated demo places and events matched to your location, budget, interests, and schedule.</p>
            <DiscoverySearch />
            <div className="mt-12 grid grid-cols-3 gap-3 border-t border-line pt-5 text-sm">
              <div><p className="font-bold text-ink">Traceable</p><p className="mt-1 text-muted">Sources and freshness</p></div>
              <div><p className="font-bold text-ink">Feasible</p><p className="mt-1 text-muted">Time and route checked</p></div>
              <div><p className="font-bold text-ink">Local</p><p className="mt-1 text-muted">Mumbai-first discovery</p></div>
            </div>
          </section>
          <section className="relative min-h-[430px] overflow-hidden border-t border-line bg-[#e8edf0] lg:min-h-full lg:border-l lg:border-t-0">
            <div className="map-grid absolute inset-0"><div className="map-water" /><div className="map-road left-[8%] top-[28%] w-[75%] rotate-[18deg]" /><div className="map-road left-[3%] top-[61%] w-[83%] rotate-[-12deg]" /><div className="map-road left-[28%] top-[10%] h-[90%] w-[2px] rotate-[12deg]" /><div className="map-road left-[52%] top-[9%] h-[84%] w-[2px] rotate-[-22deg]" /><div className="map-pin left-[25%] top-[34%]" /><div className="map-pin left-[52%] top-[56%] bg-[#087443]" /><div className="map-pin left-[67%] top-[25%] bg-[#A15C07]" /><div className="map-pin left-[39%] top-[72%] bg-[#18202B]" /></div>
            <div className="absolute left-5 top-5 right-5 flex items-center justify-between rounded-xl border border-white/80 bg-white px-4 py-3 shadow-card sm:left-8 sm:right-8 sm:top-8"><div className="flex items-center gap-2"><MapPin size={18} className="text-blue" weight="fill" /><span className="text-sm font-semibold">Near Churchgate</span></div><span className="text-xs font-semibold text-muted">Map preview</span></div>
            <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/80 bg-white p-4 shadow-float sm:bottom-8 sm:left-8 sm:right-auto sm:w-[330px]"><div className="flex items-start justify-between"><div><StatusLabel tone="blue">Demo seed record</StatusLabel><h2 className="mt-3 text-lg font-bold tracking-[-0.02em]">Kala Ghoda Art Walk</h2><p className="mt-1 text-sm text-muted">12 min estimate · 2 hours · ₹700</p></div><ArrowRight size={18} className="text-blue" /></div><div className="mt-4 text-xs font-semibold text-muted">Operational details require verification</div></div>
          </section>
        </div>

        <section className="border-t border-line px-5 py-10 sm:px-8 lg:px-14">
          <SectionHeading eyebrow="Starting soon" title="Happening near you" href="/events" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{eventSeed.map((event) => <article key={event.id} className="border border-line bg-white p-5 transition-colors hover:border-blue"><div className="flex items-center justify-between"><StatusLabel tone="blue">{event.timeLabel}</StatusLabel><CalendarDots size={20} className="text-muted" /></div><h3 className="mt-5 text-lg font-bold tracking-[-0.02em]">{event.name}</h3><p className="mt-2 text-sm leading-6 text-muted">{event.venue} · {event.distance}</p><div className="mt-5 flex items-center justify-between text-sm"><span className="font-semibold text-ink">{event.price}</span><a className="font-bold text-blue" href="/events">View event <ArrowRight size={15} className="inline" /></a></div></article>)}</div>
        </section>

        <section className="border-t border-line px-5 py-10 pb-28 sm:px-8 lg:px-14 lg:pb-12"><SectionHeading eyebrow="Selected for this area" title="Local places worth a look" href="/explore" /><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{experienceSeed.map((place) => <article key={place.id} className="border border-line bg-white p-5"><div className="flex h-28 items-end bg-[#dfe8e5] p-3"><span className="text-xs font-bold uppercase tracking-[0.12em] text-green">{place.category}</span></div><h3 className="mt-4 font-bold tracking-[-0.02em]">{place.name}</h3><p className="mt-1 text-sm text-muted">{place.area} · {place.duration}</p><div className="mt-4 flex items-center justify-between text-sm"><span className="font-semibold">{place.price}</span><a className="font-bold text-blue" href={`/experience/${place.id}`}>Open</a></div></article>)}</div></section>
        <BottomNav />
      </div>
    </main>
  );
}
