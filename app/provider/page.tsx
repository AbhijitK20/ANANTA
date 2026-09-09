"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle, Clock, MapPin, Plus, Storefront } from "@phosphor-icons/react/dist/ssr";
import { StatusLabel } from "@/components/ui";
import { providerListingSeed, readProviderListings, writeProviderListings, type ProviderListing } from "@/lib/provider";
import { readOperations, writeOperations } from "@/lib/operations";

export default function ProviderPage() {
  const [listings, setListings] = useState<ProviderListing[]>(providerListingSeed);
  const [submitted, setSubmitted] = useState(false);
  const [availability, setAvailability] = useState<Record<string, ProviderListing["availability"]>>({});

  useEffect(() => setListings(readProviderListings()), []);

  const submitListing = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = `draft-${Date.now()}`;
    const listing: ProviderListing = {
      id,
      name: String(form.get("name")),
      area: String(form.get("area")),
      category: String(form.get("category")),
      status: "Under review",
      availability: "Open",
      updated: "Just now",
    };
    const nextListings = [listing, ...listings];
    setListings(nextListings);
    writeProviderListings(nextListings);
    writeOperations([{
      id: `op-${id}`,
      kind: "experience",
      title: listing.name,
      area: listing.area,
      source: String(form.get("source")),
      status: "Needs review",
      detail: `${listing.category} provider submission`,
      lastChecked: "Not checked",
    }, ...readOperations()]);
    setSubmitted(true);
    event.currentTarget.reset();
  };

  const updateAvailability = (id: string, value: ProviderListing["availability"]) => {
    const nextListings = listings.map((listing) => listing.id === id ? { ...listing, availability: value, updated: "Just now" } : listing);
    setListings(nextListings);
    setAvailability((current) => ({ ...current, [id]: value }));
    writeProviderListings(nextListings);
  };

  return <main className="min-h-screen bg-canvas"><div className="mx-auto min-h-screen max-w-[1320px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card"><header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8"><a href="/" className="flex items-center gap-2 text-sm font-bold"><ArrowLeft size={18} /> Local Tourist</a><div className="text-right"><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Provider workspace</p><h1 className="mt-1 text-lg font-bold">Manage your local listings</h1></div></header><section className="px-5 pb-12 pt-10 sm:px-8 lg:px-14"><div className="grid gap-10 lg:grid-cols-[1fr_430px]"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Your experiences</p><h2 className="mt-3 text-4xl font-bold tracking-[-0.05em]">Keep the details current.</h2><p className="mt-4 max-w-2xl leading-7 text-muted">Update availability, capacity, and listing details so travelers receive recommendations they can actually use.</p><div className="mt-8 space-y-3">{listings.map((listing) => <ListingCard key={listing.id} listing={listing} availability={availability[listing.id] ?? listing.availability} onAvailabilityChange={(value) => updateAvailability(listing.id, value)} />)}</div></div><form onSubmit={submitListing} className="h-fit border border-line bg-[#fbfcfd] p-5 sm:p-7"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blueSoft text-blue"><Plus size={21} /></div><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">New listing</p><h2 className="mt-1 text-xl font-bold">Submit an experience</h2></div></div><div className="mt-6 space-y-4"><Field name="name" label="Experience name" placeholder="Example: Weekend pottery workshop" /><Field name="area" label="Area" placeholder="Vashi, Fort, Bandra" /><label className="block text-sm font-semibold">Category<select name="category" className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-3 text-sm outline-none focus:border-blue" defaultValue="Workshop"><option>Workshop</option><option>Food</option><option>Culture</option><option>Nature</option><option>Shopping</option></select></label><div className="grid grid-cols-2 gap-3"><Field name="price" label="Price" placeholder="₹700" /><Field name="duration" label="Duration" placeholder="2 hours" /></div><Field name="source" label="Source URL" placeholder="https://your-site.example" type="url" /></div><button className="mt-6 w-full rounded-lg bg-blue px-4 py-3 text-sm font-bold text-white hover:bg-[#1249ad]" type="submit">Submit for review</button>{submitted && <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-green"><CheckCircle size={17} /> Submitted. An admin must verify it before publishing.</p>}</form></div></section></div></main>;
}

function Field({ name, label, placeholder, type = "text" }: { name: string; label: string; placeholder: string; type?: string }) { return <label className="block text-sm font-semibold">{label}<input required name={name} type={type} placeholder={placeholder} className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-3 text-sm outline-none focus:border-blue" /></label>; }

function ListingCard({ listing, availability, onAvailabilityChange }: { listing: ProviderListing; availability: ProviderListing["availability"]; onAvailabilityChange: (value: ProviderListing["availability"]) => void }) { return <article className="border border-line p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-3"><StatusLabel tone={listing.status === "Published" ? "green" : "blue"}>{listing.status}</StatusLabel><span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{listing.category}</span></div><h3 className="mt-4 text-xl font-bold">{listing.name}</h3><p className="mt-1 text-sm text-muted">{listing.area} · Updated {listing.updated}</p></div><Storefront size={24} className="text-muted" /></div><div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_auto] sm:items-center"><div className="flex flex-wrap gap-4 text-xs font-semibold text-muted"><span><MapPin size={14} className="mr-1 inline" />Service area confirmed</span><span><Clock size={14} className="mr-1 inline" />Availability affects discovery</span></div><label className="text-xs font-bold text-muted">Availability<select value={availability} onChange={(event) => onAvailabilityChange(event.target.value as ProviderListing["availability"])} className="ml-2 rounded-lg border border-line bg-white px-2 py-2 text-xs font-bold text-ink"><option>Open</option><option>Limited</option><option>Closed</option></select></label></div></article>; }
