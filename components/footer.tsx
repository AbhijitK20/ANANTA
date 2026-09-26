import { demoUserLocation } from "@/lib/location";

/**
 * One footer, on every traveller screen.
 *
 * `/privacy` and `/terms` used to be reachable only from the desktop top nav,
 * which made them unreachable on the mobile demo viewport, and `/provider` and
 * `/admin/operations` had no inbound link at all even though the demo script
 * opens both mid-demo. One footer fixes all four.
 *
 * The two paragraphs are the disclosure surface and they are not styling. Every
 * number on this site is an estimate or it is sourced, and this is where a
 * traveller reads which is which, so the copy here is fixed text that no
 * restyle round gets to rewrite. What a design pass may change is the weight
 * around it, and this one only made it quieter: the links are the reason the
 * block exists, so they carry the contrast and the paragraphs do not.
 */

const PRODUCT = [
  { href: "/explore", label: "Explore" },
  { href: "/trips", label: "Trips" },
  { href: "/events", label: "Events" },
  { href: "/saved", label: "Saved" },
  { href: "/profile", label: "Profile" },
];

const LEGAL = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
];

const SIDES = [
  { href: "/provider", label: "For providers" },
  { href: "/admin/operations", label: "Operations" },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-canvas px-5 py-8 sm:px-8 lg:px-14">
      <div className="flex flex-col gap-7 lg:flex-row lg:justify-between lg:gap-12">
        <div className="max-w-md">
          <p className="text-sm font-bold tracking-[-0.03em]">Ananta</p>
          <p className="mt-2 text-xs leading-5 text-muted">
            Fit-first local discovery for Mumbai and Navi Mumbai. Distances are straight-line estimates
            measured from a fixed demo position at {demoUserLocation.label}, not live geolocation and not
            live routing. Prices, durations, hours, and availability on most records are deterministic demo
            estimates, and every field says which it is.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-7 sm:grid-cols-3">
          <FooterGroup title="Product" links={PRODUCT} />
          <FooterGroup title="Legal" links={LEGAL} />
          <FooterGroup title="Other sides" links={SIDES} />
        </div>
      </div>
      <p className="mt-7 border-t border-line pt-4 text-[11px] leading-5 text-muted">
        No account, no server, no behavioural profile uploaded. Saved places, draft plans, reports, and your
        weight edits live in this browser&apos;s local storage and disappear when you clear site data.
      </p>
    </footer>
  );
}

/**
 * `grid-cols-2` at 390px with three groups means the third group wraps under
 * the second, and the links stay two columns wide, which is 44px-plus per
 * target. The list is the accessible path to every legal page at that width.
 */
function FooterGroup({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{title}</p>
      <ul className="mt-2 space-y-1">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="inline-block py-1 text-sm font-semibold text-ink transition-colors hover:text-blue"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
