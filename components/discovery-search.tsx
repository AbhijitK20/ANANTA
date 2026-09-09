"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Compass } from "@phosphor-icons/react/dist/ssr";
import { discoveryUrl } from "@/lib/discovery";

const quickRequests = [
  "I have 45 minutes near Churchgate",
  "I need to return to CST before my train",
  "Local places under ₹800",
  "Indoor culture for a rainy day",
];

export function DiscoverySearch() {
  const [query, setQuery] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    window.location.href = discoveryUrl(query.trim() || "Local experiences near me");
  };
  return <form onSubmit={submit} className="mt-9 max-w-[600px]"><label htmlFor="discovery-query" className="sr-only">Describe what you want to do</label><div className="flex items-center gap-3 rounded-xl border border-line bg-canvas px-4 py-3 shadow-sm focus-within:border-blue"><Compass size={22} className="shrink-0 text-muted" /><input id="discovery-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="I have 3 hours near CST and want local food" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted" /><button aria-label="Search experiences" className="rounded-lg bg-blue p-2 text-white"><ArrowRight size={17} /></button></div><div className="mt-3 flex flex-wrap gap-2">{quickRequests.map((request) => <button type="button" onClick={() => { setQuery(request); window.location.href = discoveryUrl(request); }} key={request} className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-blue hover:text-blue">{request === quickRequests[0] ? "45 minutes" : request.includes("train") ? "Before my train" : request.includes("₹800") ? "Under ₹800" : "Rainy day"}</button>)}</div><button className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue px-4 py-3 text-sm font-bold text-white hover:bg-[#1249ad]">See what is nearby <ArrowRight size={17} /></button></form>;
}
