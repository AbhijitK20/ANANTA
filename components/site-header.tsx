"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PlanBadge } from "@/components/plan-badge";

/**
 * The site header. One bar, sticky, and the first thing on every page.
 *
 * This is the component the twelve inline `<header>` elements in `app/` were
 * each a copy of. It is deliberately not mounted in `app/layout.tsx` yet: every
 * page renders its own header and its own `<BottomNav />`, so adding a global
 * one would put two of each on the screen. Adopting it is a one-line swap per
 * page, and it belongs to whoever owns that page.
 *
 * The active route is read from the URL, not from a prop. The copy this replaced
 * hardcoded `aria-current="page"` on whichever link the author remembered to
 * mark, which meant the announcement was wrong on eleven of the twelve pages and
 * the highlight never moved. A parent segment counts, so `/events/42` marks
 * Events and `/` marks only itself.
 *
 * "Discover" is the landing route and "/" is the only path that must match
 * exactly, since every path starts with a slash.
 */

const NAV: readonly { href: string; label: string; badge?: boolean }[] = [
  { href: "/", label: "Discover" },
  { href: "/explore", label: "Explore" },
  { href: "/events", label: "Events" },
  { href: "/trips", label: "Trips", badge: true },
  { href: "/saved", label: "Saved" },
  { href: "/profile", label: "Profile" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="glass sticky top-0 z-sticky">
      <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between gap-6 px-5 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="" className="h-8 w-8" />
          <span className="text-lg font-bold tracking-[-0.03em]">Ananta</span>
        </Link>

        {/*
         * The links live from `lg` up. Below that the fixed `BottomNav` is the
         * navigation, and a second set of links above it would be the same
         * destinations twice on the primary demo viewport.
         */}
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV.map(({ href, label, badge }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-[44px] items-center gap-1.5 rounded px-3 text-sm font-semibold ${
                  active ? "text-blue" : "text-muted hover:text-ink"
                }`}
              >
                {label}
                {badge && <PlanBadge />}
                {/*
                 * The active marker is a bar that scales in, so it arrives on
                 * `transform` and the reduced-motion block can neutralise it
                 * with the depth transforms. It is `aria-hidden` because
                 * `aria-current` above already says it, and saying it twice
                 * makes a screen reader say it twice.
                 */}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-3 bottom-1.5 h-0.5 origin-left rounded-full bg-blue transition-transform duration-200 ease-soft ${
                    active ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        {/*
         * The city control. It is a link and not a picker because the only
         * thing it does is open Explore filtered to that city, and a control
         * that opens a view is a link wearing a costume.
         */}
        <Link
          href="/explore?city=Mumbai"
          className="shrink-0 rounded border border-line px-3 py-2 text-sm font-semibold text-ink hover:border-blue hover:text-blue"
        >
          Mumbai
        </Link>
      </div>
    </header>
  );
}
