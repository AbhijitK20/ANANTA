"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Icon } from "@phosphor-icons/react";
import { BookmarkSimple, Compass, House, MapTrifold, UserCircle } from "@phosphor-icons/react/dist/ssr";

import { PlanBadge } from "@/components/plan-badge";

/**
 * One item of the mobile navigation.
 *
 * The nav itself is a server component in `components/ui.tsx` and stays there,
 * because the shell is layout and layout does not need the URL. This one item
 * is a client component because the active state is read from the URL, and it
 * used to be wrong: `aria-current` was hardcoded to `index === 0`, so every page
 * announced "Home" and highlighted Home no matter where the traveller was. The
 * parent segment counts, so `/events/42` marks Events, and `/` marks only
 * itself, since every path starts with a slash.
 *
 * The icons are looked up by href rather than passed in. A component reference
 * cannot cross the server to client boundary, and passing a rendered element
 * would mean rendering both the filled and the regular weight and choosing
 * between them here, which is the same lookup with more ceremony.
 *
 * The active state is carried three ways at once: colour, icon weight and
 * `aria-current`. One of those alone would fail a traveller who cannot tell the
 * accent from the muted grey, which is the argument the provenance chips make
 * about dashed borders.
 */

const ICONS: Record<string, Icon> = {
  "/": House,
  "/explore": MapTrifold,
  "/trips": Compass,
  "/saved": BookmarkSimple,
  "/profile": UserCircle,
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNavItem({
  href,
  label,
  badge = false,
}: {
  href: string;
  label: string;
  badge?: boolean;
}) {
  const pathname = usePathname();
  const active = isActive(pathname, href);
  const NavIcon = ICONS[href];

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-w-[58px] flex-col items-center gap-1 text-xs font-semibold ${
        active ? "text-blue" : "text-muted"
      }`}
    >
      <span className="relative">
        {NavIcon && <NavIcon size={21} weight={active ? "fill" : "regular"} />}
        {badge && (
          <span className="absolute -right-2 -top-1">
            <PlanBadge />
          </span>
        )}
      </span>
      {label}
    </Link>
  );
}
