"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, Compass } from "@phosphor-icons/react/dist/ssr";
import { discoveryUrl } from "@/lib/discovery";
import { typeScale, depth } from "@/components/ananta/tokens";

/**
 * The landing hero search.
 *
 * The primary action used to be a bare `<a>` styled as a button and the search
 * button had no `type`, so it defaulted to submit inside a form that called
 * `preventDefault` and a click on it did nothing useful. Both are fixed: the
 * arrow is an explicit `type="submit"`, and "See what is nearby" is a real
 * `Link` to `/explore`.
 *
 * Every quick request below is a real query the engine parses. The sentence
 * "Every chip is a real query, not placeholder text" is a claim, so it has to
 * stay true, and the labels are now carried on the same object as the query
 * instead of being derived from it by a chain of string comparisons. The label
 * is the chip's accessible name and the query is what actually runs, so the two
 * cannot drift apart.
 */
type QuickRequest = {
  /** What the chip says, and its accessible name. */
  label: string;
  /** The real query the engine receives. Verbatim, not a keyword. */
  query: string;
};

const quickRequests: QuickRequest[] = [
  { label: "45 minutes", query: "I have 45 minutes near Churchgate" },
  { label: "Before my train", query: "I need to return to CST before my train" },
  { label: "Under ₹800", query: "Local places under ₹800" },
  { label: "Rainy day", query: "Indoor culture for a rainy day" },
];

/** One-tap browse filters that deep-link into the Explore map. */
const browseFilters = [
  { label: "Nightlife", href: "/explore?q=nightlife" },
  { label: "Community sourced", href: "/explore?gems=1" },
  { label: "Free entry", href: "/explore?free=1" },
  { label: "Walkable in 30 min", href: "/explore?walkable=1" },
  { label: "Best in the morning", href: "/explore?bestTime=Best%20in%20the%20morning" },
  { label: "Best after dark", href: "/explore?bestTime=Best%20after%20dark" },
  { label: "Food", href: "/explore?q=food" },
  { label: "Nature", href: "/explore?q=nature" },
  { label: "Navi Mumbai", href: "/explore?city=Navi%20Mumbai" },
];

export function DiscoverySearch() {
  const [query, setQuery] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    window.location.href = discoveryUrl(text || "Local experiences near me");
  };

  return (
    <form onSubmit={submit} className="mt-9 max-w-[600px]">
      <label htmlFor="discovery-query" className="sr-only">
        Describe what you want to do
      </label>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas px-4 py-3 shadow-sm focus-within:border-blue">
        <Compass size={22} className="shrink-0 text-muted" aria-hidden />
        <input
          id="discovery-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="I have 3 hours near CST and want local food"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
        {/* An explicit submit, so the primary control in the hero does what a
            primary control is supposed to do. */}
        <button type="submit" aria-label="Search experiences" className="rounded-lg bg-blue p-2 text-white">
          <ArrowRight size={17} aria-hidden />
        </button>
      </div>

      <div className={`stage-3d mt-3 flex flex-wrap gap-2 ${depth.flush}`}>
        {quickRequests.map((request) => (
          <button
            key={request.label}
            type="button"
            onClick={() => {
              setQuery(request.query);
              window.location.href = discoveryUrl(request.query);
            }}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-blue hover:text-blue"
          >
            {request.label}
          </button>
        ))}
      </div>

      <p className={`mt-2 ${typeScale.meta} text-muted`}>
        Tap a chip to run the search instantly, or type your own description above. Every chip is a real query, not
        placeholder text.
      </p>

      <p className={`mt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted`}>Browse by</p>
      <div className={`stage-3d mt-2 flex flex-wrap gap-2 ${depth.flush}`}>
        {browseFilters.map((filter) => (
          <Link
            key={filter.label}
            href={filter.href}
            className="rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-semibold text-ink hover:border-blue hover:text-blue"
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {/* The one raised thing on the hero. A raised chip is an available action;
          the flush strips are context. No hover tilt here, because a strip of
          tilting pills is noise and the depth already says "this one". */}
      <div className="stage mt-5 inline-block">
        <Link
          href="/explore"
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue px-4 py-3 text-sm font-bold text-white hover:bg-[#1249ad] ${depth.raised}`}
        >
          See what is nearby
          <ArrowRight size={17} aria-hidden />
        </Link>
      </div>
    </form>
  );
}
