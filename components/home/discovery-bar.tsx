"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Compass, MagnifyingGlass, X } from "@phosphor-icons/react/dist/ssr";
import { discoveryUrl } from "@/lib/discovery";

/**
 * The hero search, and the only client component on the landing.
 *
 * It is split out of `components/home/hero.tsx` on purpose. The hero is a server
 * component that reads `credibilityLine()`, which walks the whole catalogue, and
 * putting the search box in the same file would pull every record into the client
 * bundle to service a text input. This file imports exactly one thing from `lib`,
 * `discoveryUrl`, which is a template string.
 *
 * `components/discovery-search.tsx` already did this job and is owned by the
 * Explore session, so it is read for behaviour and reimplemented here rather than
 * edited. What is carried over unchanged: the quick requests are real queries the
 * engine parses rather than placeholder text, the submit is an explicit
 * `type="submit"`, and the empty box still sends a query instead of doing nothing.
 *
 * The clear button exists because a search box with no way back to empty is a
 * dead end, and it is a real `<button type="button">` so it cannot submit.
 */

type QuickRequest = {
  /** What the chip says, and its accessible name. */
  label: string;
  /** The real query `/explore` receives. Verbatim, not a keyword. */
  query: string;
};

const QUICK_REQUESTS: QuickRequest[] = [
  { label: "45 minutes", query: "I have 45 minutes near Churchgate" },
  { label: "Before my train", query: "I need to return to CST before my train" },
  { label: "Under â‚¹800", query: "Local places under â‚¹800" },
  { label: "Rainy day", query: "Indoor culture for a rainy day" },
];

/** What an empty box searches for. A real phrase the parser reads, not a blank. */
const FALLBACK_QUERY = "Local experiences near me";

export function DiscoveryBar() {
  const [query, setQuery] = useState("");

  const go = (text: string) => {
    window.location.href = discoveryUrl(text.trim() || FALLBACK_QUERY);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    go(query);
  };

  return (
    <form onSubmit={submit} className="mt-8 max-w-[620px]">
      <label htmlFor="home-discovery" className="sr-only">
        Describe what you want to do
      </label>

      {/* The prominent control. `shadow-lifted` is the one depth step that says
          "this is the thing", and the whole bar sits in a `stage-3d` so the step
          is a real position in space rather than a shadow pretending to be one. */}
      <div className="stage-3d">
        <div className="flex items-center gap-2 rounded-card border border-line bg-surface p-2 shadow-lifted transition-colors duration-200 focus-within:border-blue">
          <Compass size={22} className="ml-2 shrink-0 text-blue" aria-hidden="true" />
          <input
            id="home-discovery"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="I have 3 hours near CST and want local food"
            className="min-w-0 flex-1 bg-transparent py-2 text-body text-ink outline-none placeholder:text-muted"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear the search"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-chip text-muted hover:bg-canvas hover:text-ink"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
          <button
            type="submit"
            aria-label="Search experiences"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-blue text-onAccent hover:bg-[var(--color-accent-hover)]"
          >
            <ArrowRight size={18} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
          <MagnifyingGlass size={13} aria-hidden="true" />
          Try
        </span>
        {QUICK_REQUESTS.map((request) => (
          <button
            key={request.label}
            type="button"
            onClick={() => {
              setQuery(request.query);
              go(request.query);
            }}
            className="min-h-[32px] rounded-chip border border-line bg-surface px-2.5 py-1.5 text-[13px] font-semibold text-ink hover:border-blue hover:text-blue"
          >
            {request.label}
          </button>
        ))}
      </div>
    </form>
  );
}
